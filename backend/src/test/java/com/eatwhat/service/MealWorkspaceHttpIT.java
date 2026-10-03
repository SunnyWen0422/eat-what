package com.eatwhat.service;

import com.eatwhat.EatWhatApplication;
import com.eatwhat.dto.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes=EatWhatApplication.class,webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class MealWorkspaceHttpIT {
    @Autowired private TestRestTemplate http;
    @Autowired private TokenService tokens;
    @Autowired private com.fasterxml.jackson.databind.ObjectMapper json;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate sql;
    @DynamicPropertySource static void configuration(DynamicPropertyRegistry r) {
        String url=System.getenv("V4_TEST_JDBC");
        if(url==null||!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_v4_test_[a-z0-9]+\\?.*"))throw new IllegalStateException("Use private MySQL test script");
        r.add("spring.datasource.url",()->url);r.add("spring.datasource.username",()->"root");r.add("spring.datasource.password",()->System.getenv("V4_TEST_PASSWORD"));
        r.add("security.token.secret",()->UUID.randomUUID().toString()+UUID.randomUUID().toString());
        r.add("wechat.miniapp.appid",()->"test-local");r.add("wechat.miniapp.secret",()->"test-local");
        r.add("server.address",()->"127.0.0.1");r.add("meal-workspace.enabled",()->true);r.add("mybatis.configuration.map-underscore-to-camel-case",()->true);
        r.add("logging.level.com.eatwhat.mapper",()->"WARN");
    }
    private <T> ResponseEntity<T> call(String path,Long user,Object body,Class<T> response) {
        HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);
        if(user!=null)headers.setBearerAuth(tokens.generateToken(user));
        return http.exchange(path,body==null?HttpMethod.GET:HttpMethod.POST,new HttpEntity<>(body,headers),response);
    }
    @Test void allThreeMealsUseAuthenticatedPersistentRulesAndConfirmation() throws Exception {
        String day=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        assertEquals(401,call("/meal-workspaces/current?date="+day+"&mealType=lunch",null,null,Map.class).getStatusCodeValue());
        for(String meal:Arrays.asList("breakfast","lunch","dinner")) {
            MealContext c=new MealContext();c.setDate(day);c.setMealType(meal);c.setPeople(2);
            WorkspaceRequest create=new WorkspaceRequest();create.setRequestId("http-create-"+meal);create.setExpectedWorkspaceRevision(0L);create.setContext(c);
            ResponseEntity<MealWorkspace> created=call("/meal-workspaces",3L,create,MealWorkspace.class);assertEquals(200,created.getStatusCodeValue());MealWorkspace w=created.getBody();
            WorkspaceRequest command=new WorkspaceRequest();command.setRequestId("http-generate-"+meal);command.setExpectedWorkspaceRevision(w.getRevision());command.setPlanVersion(0L);command.setCommand("generate");
            assertEquals(200,call("/meal-workspaces/"+w.getId()+"/commands",3L,command,MealWorkspace.class).getStatusCodeValue());
            Map<?,?> linked=null;
            for(int i=0;i<100;i++) {
                linked=call("/meal-workspaces/current?date="+day+"&mealType="+meal,3L,null,Map.class).getBody();
                Map<?,?> workspace=(Map<?,?>)linked.get("workspace");if(!"generating".equals(workspace.get("status")))break;Thread.sleep(100);
            }
            Map<?,?> workspace=(Map<?,?>)linked.get("workspace");assertEquals("draft",workspace.get("status"));Map<?,?> draft=(Map<?,?>)workspace.get("draft");assertEquals(2,((List<?>)draft.get("dishes")).size());
            BehaviorEventRequest exposure=new BehaviorEventRequest();exposure.setRequestId("http-exposed-"+meal);exposure.setWorkspaceId(w.getId());exposure.setEventType("exposed");exposure.setExpectedWorkspaceRevision(((Number)workspace.get("revision")).longValue());exposure.setPlanVersion(((Number)draft.get("planVersion")).longValue());
            assertEquals(200,call("/behavior-events",3L,exposure,Map.class).getStatusCodeValue());assertEquals(200,call("/behavior-events",3L,exposure,Map.class).getStatusCodeValue());
            WorkspaceRequest confirm=new WorkspaceRequest();confirm.setRequestId("http-confirm-"+meal);confirm.setExpectedWorkspaceRevision(((Number)workspace.get("revision")).longValue());confirm.setPlanVersion(((Number)draft.get("planVersion")).longValue());confirm.setExpectedPlanRevision(0L);
            assertEquals(200,call("/meal-workspaces/"+w.getId()+"/confirm",3L,confirm,MealWorkspace.class).getStatusCodeValue());
            linked=call("/meal-workspaces/current?date="+day+"&mealType="+meal,3L,null,Map.class).getBody();assertNotNull(((Map<?,?>)linked.get("plan")).get("recipeName"));assertNull(linked.get("actual"));
            List<?> dishIds=(List<?>)((Map<?,?>)linked.get("plan")).get("dishIds");
            Map<String,Object> previewBody=new HashMap<>();previewBody.put("dishIds",dishIds);previewBody.put("targetPeople",2);previewBody.put("clientRequestId","http-preview-"+meal);
            ResponseEntity<ShoppingPreviewResponse> previewResponse=call("/shopping-list/preview",3L,previewBody,ShoppingPreviewResponse.class);assertEquals(200,previewResponse.getStatusCodeValue());
            ShoppingPreviewResponse preview=previewResponse.getBody();assertFalse(preview.getDishes().isEmpty());
            ResponseEntity<Map> listResponse=call("/shopping-list",3L,null,Map.class);assertEquals(200,listResponse.getStatusCodeValue());Map<?,?> list=listResponse.getBody();assertNotNull(list.get("version"));
            ShoppingBatchAddRequest purchase=new ShoppingBatchAddRequest();purchase.setRequestId("http-purchase-"+meal);purchase.setPreviewId(preview.getPreviewId());purchase.setExpectedListVersion(((Number)list.get("version")).longValue());purchase.setTargetPeople(java.math.BigDecimal.valueOf(2));
            for(ShoppingDishDTO d:preview.getDishes()) {ShoppingDishRequest group=json.convertValue(d,ShoppingDishRequest.class);group.setSelectionKey("meal-"+day+"-"+meal+"-"+d.getDishId());group.setSourceDate(day);group.setSourceMealType(meal);purchase.getDishes().add(group);}
            assertEquals(200,call("/shopping-list/items:batch-add",3L,purchase,Map.class).getStatusCodeValue());
            assertEquals(200,call("/shopping-list/items:batch-add",3L,purchase,Map.class).getStatusCodeValue());
            assertNull(call("/meal-workspaces/current?date="+day+"&mealType="+meal,3L,null,Map.class).getBody().get("actual"));
            String savedName=String.valueOf(((Map<?,?>)((List<?>)((Map<?,?>)linked.get("plan")).get("dishDetails")).get(0)).get("name"));
            sql.update("UPDATE food SET NAME=CONCAT(NAME,' edited') WHERE ID=?",dishIds.get(0));
            MealConsumptionRequest eaten=new MealConsumptionRequest();eaten.setRequestId("http-eaten-"+meal);eaten.setExpectedRevision(0L);eaten.setExpectedPlanRevision(((Number)linked.get("planRevision")).longValue());eaten.setStatus("eaten");eaten.setUsePlan(true);
            HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);headers.setBearerAuth(tokens.generateToken(3L));
            ResponseEntity<Map> actual=http.exchange("/meal-consumptions/"+day+"/"+meal,HttpMethod.PUT,new HttpEntity<>(eaten,headers),Map.class);assertEquals(200,actual.getStatusCodeValue());assertEquals("eaten",actual.getBody().get("status"));assertEquals(savedName,((Map<?,?>)((List<?>)actual.getBody().get("actualDishes")).get(0)).get("name"));
            assertEquals(200,http.exchange("/meal-consumptions/"+day+"/"+meal,HttpMethod.PUT,new HttpEntity<>(eaten,headers),Map.class).getStatusCodeValue());
            assertEquals(200,call("/meal-workspaces/"+w.getId()+"/commands",3L,command,Map.class).getStatusCodeValue());
            // The same old request may replay; a different request from a stale device must conflict.
            command.setRequestId("http-stale-"+meal);assertEquals(409,call("/meal-workspaces/"+w.getId()+"/commands",3L,command,Map.class).getStatusCodeValue());
            assertNull(call("/meal-workspaces/current?date="+day+"&mealType="+meal,4L,null,Map.class).getBody().get("plan"));
        }
        Map<?,?> review=call("/diet-reviews?startDate="+day+"&endDate="+day,3L,null,Map.class).getBody();assertEquals(3,((Number)review.get("mealCount")).intValue());
    }
}
