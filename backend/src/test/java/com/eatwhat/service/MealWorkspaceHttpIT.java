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
    @Autowired private com.eatwhat.mapper.FavoriteDishMapper favorites;
    @Autowired private com.eatwhat.mapper.MealConsumptionMapper actualRecords;
    @Autowired private MealWorkspacePlanner planner;
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
    private ResponseEntity<Map> actual(String day,String meal,Long user,MealConsumptionRequest body) {
        HttpHeaders headers=new HttpHeaders(); headers.setContentType(MediaType.APPLICATION_JSON);
        if(user!=null)headers.setBearerAuth(tokens.generateToken(user));
        return http.exchange("/meal-consumptions/"+day+"/"+meal,HttpMethod.PUT,new HttpEntity<>(body,headers),Map.class);
    }
    @Test void allThreeMealsUseAuthenticatedPersistentRulesAndConfirmation() throws Exception {
        String day=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        assertEquals(401,call("/meal-workspaces/current?date="+day+"&mealType=lunch",null,null,Map.class).getStatusCodeValue());
        exerciseOwnedRankingSql(day);
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
        exerciseHistoricalActualEdits(day);
        exercisePersistentClearScopesAndReplay();
        review=call("/diet-reviews?startDate="+day+"&endDate="+day,3L,null,Map.class).getBody();
        assertEquals(3,((Number)review.get("mealCount")).intValue()); assertEquals(9,((Number)review.get("entryCount")).intValue());
        assertEquals(0,((Number)call("/diet-reviews?startDate="+day+"&endDate="+day,4L,null,Map.class).getBody().get("mealCount")).intValue());
    }
    private void exerciseOwnedRankingSql(String day) throws Exception {
        // Query ranking dependencies directly so fixture/schema failures expose the actual SQL cause.
        assertTrue(favorites.selectDishIdsByUser(3L).isEmpty());
        String recentDate=java.time.LocalDate.parse(day).minusDays(1).toString();
        String outsideDate=java.time.LocalDate.parse(day).minusDays(8).toString();
        List<Long> ids=sql.queryForList("SELECT id FROM food WHERE IS_PUBLISHED=1 AND FIND_IN_SET('BREAKFAST_ELIGIBLE',TAG_CODES)>0 ORDER BY id LIMIT 3",Long.class);
        assertEquals(3,ids.size());
        MealContext context=new MealContext();context.setDate(day);context.setMealType("breakfast");context.setPeople(2);
        try {
            saveRankingFavorite(3L,ids.get(0));saveRankingFavorite(4L,ids.get(1));
            assertEquals(Collections.singletonList(ids.get(0)),favorites.selectDishIdsByUser(3L));
            assertEquals(Collections.singletonList(ids.get(1)),favorites.selectDishIdsByUser(4L));
            saveRankingFavorite(3L,ids.get(0));
            assertEquals(1,sql.queryForObject("SELECT COUNT(*) FROM favorite_dishes WHERE USER_ID=3 AND DISH_ID=?",Integer.class,ids.get(0)));
            assertEquals(ids.get(0),planner.eligible(3L,context).get(0).getId());
            saveRankingActual(3L,recentDate,ids.get(0));saveRankingActual(4L,recentDate,ids.get(1));saveRankingActual(3L,outsideDate,ids.get(2));
            List<com.eatwhat.entity.MealConsumption> history=actualRecords.range(3L,recentDate,day);
            assertEquals(1,history.size());assertEquals(3L,history.get(0).getUserId());assertEquals(recentDate,history.get(0).getMealDate());
            assertEquals(ids.get(0).longValue(),json.readTree(history.get(0).getActualDishesJson()).get(0).path("dishId").asLong());
            List<com.eatwhat.entity.Dish> ranked=planner.eligible(3L,context);
            assertEquals(ids.get(0),ranked.get(ranked.size()-1).getId());
        } finally {
            sql.update("DELETE FROM favorite_dishes WHERE USER_ID IN (3,4)");
            sql.update("DELETE FROM meal_consumption WHERE user_id IN (3,4) AND meal_date IN (?,?) AND meal_type='lunch'",recentDate,outsideDate);
        }
    }
    private void saveRankingFavorite(Long user,Long dishId) {
        com.eatwhat.entity.FavoriteDish entry=new com.eatwhat.entity.FavoriteDish();
        entry.setUserId(user);entry.setDishId(dishId);favorites.insert(entry);
    }
    private void saveRankingActual(Long user,String day,Long dishId) {
        com.eatwhat.entity.MealConsumption entry=new com.eatwhat.entity.MealConsumption();
        entry.setUserId(user);entry.setMealDate(day);entry.setMealType("lunch");entry.setStatus("eaten");entry.setRevision(1L);entry.setActualDishesJson("[{\"dishId\":"+dishId+"}]");
        actualRecords.save(entry);
    }
    private void exerciseHistoricalActualEdits(String day) {
        for(String meal:Arrays.asList("breakfast","lunch","dinner")) {
            Map<?,?> overview=call("/recipe-records/overview?startDate="+day+"&endDate="+day,3L,null,Map.class).getBody();
            Map<?,?> original=(Map<?,?>)((List<?>)overview.get("consumptions")).stream().filter(row->meal.equals(((Map<?,?>)row).get("mealType"))).findFirst().orElseThrow(()->new AssertionError("Missing actual meal"));
            List<?> history=(List<?>)original.get("actualDishes");
            Map<?,?> snapshot=(Map<?,?>)original.get("plannedSnapshot"); assertEquals(2,((Number)snapshot.get("targetPeople")).intValue());
            // Changes and deletion occur after all three meal confirmations so fixture eligibility remains stable.
            Long deleted=Long.valueOf(String.valueOf(((Map<?,?>)history.get(0)).get("dishId")));
            Long renamed=Long.valueOf(String.valueOf(((Map<?,?>)history.get(1)).get("dishId")));
            sql.update("UPDATE food SET NAME='renamed after actual',TYPE='dessert' WHERE ID=?",renamed);
            sql.update("DELETE FROM food WHERE ID=?",deleted);
            sql.update("UPDATE recipe_records SET recipe_name='modified later plan',target_people=4,revision=revision+1,is_deleted=? WHERE user_id=3 AND record_date=? AND meal_type=?","dinner".equals(meal),day,meal);
            MealConsumptionRequest edit=new MealConsumptionRequest(); edit.setRequestId("http-retain-"+meal); edit.setExpectedRevision(((Number)original.get("revision")).longValue()); edit.setStatus("eaten");
            for(int index=0;index<history.size();index++) {MealConsumptionRequest.Entry retained=new MealConsumptionRequest.Entry();retained.setRetainedEntryIndex(index);edit.getDishes().add(retained);}
            MealConsumptionRequest.Entry changed=new MealConsumptionRequest.Entry(); changed.setName("HTTP实际新增"+meal); edit.getDishes().add(changed);
            ResponseEntity<Map> saved=actual(day,meal,3L,edit); assertEquals(200,saved.getStatusCodeValue());
            List<?> savedHistory=(List<?>)saved.getBody().get("actualDishes");
            for(int index=0;index<history.size();index++)assertEquals(history.get(index),savedHistory.get(index));
            assertEquals(original.get("sourceRecordId"),saved.getBody().get("sourceRecordId"));
            Map<?,?> savedSnapshot=(Map<?,?>)saved.getBody().get("plannedSnapshot");
            for(String field:Arrays.asList("name","dishIds","revision","recordOrigin","targetPeople"))assertEquals(snapshot.get(field),savedSnapshot.get(field));
            assertEquals(false,savedSnapshot.get("confirmedAsPlanned"));
            assertEquals(saved.getBody(),actual(day,meal,3L,edit).getBody());
            assertEquals(2L,sql.queryForObject("SELECT revision FROM meal_consumption WHERE user_id=3 AND meal_date=? AND meal_type=?",Long.class,day,meal));
            edit.setRequestId("http-retain-stale-"+meal); assertEquals(409,actual(day,meal,3L,edit).getStatusCodeValue());
            edit.setExpectedRevision(2L);edit.setRequestId("http-retain-forged-"+meal);edit.getDishes().get(0).setName("fabricated retained name");
            assertEquals(400,actual(day,meal,3L,edit).getStatusCodeValue());
            edit.getDishes().get(0).setName(null);edit.getDishes().get(0).setRetainedEntryIndex(99);edit.setRequestId("http-retain-index-"+meal);
            assertEquals(400,actual(day,meal,3L,edit).getStatusCodeValue());
            edit.getDishes().get(0).setRetainedEntryIndex(0);edit.setRequestId("http-retain-foreign-"+meal); assertEquals(409,actual(day,meal,4L,edit).getStatusCodeValue());
            edit.setRequestId("http-retain-"+meal); assertEquals(409,actual(day,meal,3L,edit).getStatusCodeValue());
        }
    }
    private void exercisePersistentClearScopesAndReplay() {
        long version=((Number)call("/shopping-list",3L,null,Map.class).getBody().get("version")).longValue();
        for(int index=0;index<2;index++) {
            ShoppingManualRequest manual=new ShoppingManualRequest();manual.setRequestId("http-clear-manual-"+index);manual.setExpectedListVersion(version);manual.setName("clear fixture "+index);manual.setQuantityText("1包");
            ResponseEntity<Map> added=call("/shopping-list/manual-items",3L,manual,Map.class);assertEquals(200,added.getStatusCodeValue());version=((Number)added.getBody().get("version")).longValue();
        }
        Long checkedId=sql.queryForObject("SELECT i.id FROM shopping_item i JOIN shopping_dish d ON d.id=i.shopping_dish_id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=3 AND i.display_name='clear fixture 0'",Long.class);
        ShoppingCheckRequest check=new ShoppingCheckRequest();check.setRequestId("http-clear-check");check.setExpectedListVersion(version);check.setChecked(true);check.setItemIds(Collections.singletonList(checkedId));
        ResponseEntity<Map> checked=call("/shopping-list/items:batch-check",3L,check,Map.class);assertEquals(200,checked.getStatusCodeValue());version=((Number)checked.getBody().get("version")).longValue();
        int before=ownedItemCount();assertTrue(before>=2);
        ShoppingClearRequest request=new ShoppingClearRequest();request.setRequestId("http-clear-checked");request.setExpectedListVersion(version);request.setScope("checked");
        assertEquals(401,call("/shopping-list:clear",null,request,Map.class).getStatusCodeValue());
        ResponseEntity<Map> cleared=call("/shopping-list:clear",3L,request,Map.class);assertEquals(200,cleared.getStatusCodeValue());assertEquals(before-1,ownedItemCount());
        assertEquals(0,sql.queryForObject("SELECT COUNT(*) FROM shopping_item WHERE id=?",Integer.class,checkedId));
        assertEquals(cleared.getBody(),call("/shopping-list/:clear",3L,request,Map.class).getBody());assertEquals(before-1,ownedItemCount());
        request.setScope("all");assertEquals(409,call("/shopping-list:clear",3L,request,Map.class).getStatusCodeValue());
        request.setRequestId("http-clear-no-version");request.setExpectedListVersion(null);assertEquals(422,call("/shopping-list/:clear",3L,request,Map.class).getStatusCodeValue());assertEquals(before-1,ownedItemCount());
        request.setExpectedListVersion(version);request.setRequestId("http-clear-stale");assertEquals(409,call("/shopping-list:clear",3L,request,Map.class).getStatusCodeValue());
        request.setExpectedListVersion(((Number)cleared.getBody().get("version")).longValue());request.setRequestId("http-clear-all");
        ResponseEntity<Map> all=call("/shopping-list:clear",3L,request,Map.class);assertEquals(200,all.getStatusCodeValue());assertEquals(0,ownedItemCount());
        assertEquals(all.getBody(),call("/shopping-list/:clear",3L,request,Map.class).getBody());
        assertEquals(all.getBody(),call("/shopping-list:clear",3L,request,Map.class).getBody());
        assertEquals(2,sql.queryForObject("SELECT COUNT(*) FROM shopping_request_log WHERE user_id=3 AND request_id IN ('http-clear-checked','http-clear-all')",Integer.class));
    }
    private int ownedItemCount() {
        return sql.queryForObject("SELECT COUNT(*) FROM shopping_item i JOIN shopping_dish d ON d.id=i.shopping_dish_id JOIN shopping_list l ON l.id=d.shopping_list_id WHERE l.user_id=3",Integer.class);
    }
}
