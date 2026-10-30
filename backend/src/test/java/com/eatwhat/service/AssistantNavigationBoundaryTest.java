package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.dto.MealContext;
import com.eatwhat.dto.MealWorkspace;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static com.eatwhat.service.AssistantV4ContextService.map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantNavigationBoundaryTest {
    @Test void providerNavigationTargetsAgreeWithActualServerResolver() throws Exception {
        String python=System.getProperty("recommendation.python");
        Assumptions.assumeTrue(python!=null);
        ObjectMapper json=new ObjectMapper();
        Map<String,Object> target=map("date","2026-10-28","mealType","dinner");
        List<Map<String,Object>> cases=Arrays.asList(
            map("type","navigation","navigationIntent",map("kind","edit_preferences","ref",Collections.emptyMap())),
            map("type","navigation","navigationIntent",map("kind","edit_preferences","ref",Collections.emptyMap(),"target",Collections.emptyMap())),
            map("type","navigation","navigationIntent",map("kind","edit_preferences","ref",Collections.emptyMap(),"target",target)),
            map("type","navigation","navigationIntent",map("kind","record_actual","ref",Collections.emptyMap(),"target",target)));
        Process process=new ProcessBuilder(python,Paths.get("..").toAbsolutePath().normalize().resolve("scripts/check_assistant_navigation_boundary.py").toString()).redirectErrorStream(true).start();
        try(java.io.OutputStream stream=process.getOutputStream()){stream.write(json.writeValueAsBytes(cases));}
        if(!process.waitFor(20,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);fail("Isolated navigation validation timed out");}
        byte[] output=process.getInputStream().readAllBytes();
        assertEquals(0,process.exitValue(),new String(output,java.nio.charset.StandardCharsets.UTF_8));
        JsonNode results=json.readTree(output);
        assertEquals(Arrays.asList(true,true,false,true),Arrays.asList(results.get(0).path("accepted").asBoolean(),results.get(1).path("accepted").asBoolean(),results.get(2).path("accepted").asBoolean(),results.get(3).path("accepted").asBoolean()));
        MealWorkspace workspace=new MealWorkspace();workspace.setId("w");
        MealContext context=new MealContext();context.setDate("2026-10-28");context.setMealType("dinner");workspace.setContext(context);
        MealWorkspaceService workspaces=mock(MealWorkspaceService.class);when(workspaces.get(7L,"w")).thenReturn(workspace);
        AssistantGuidanceService service=new AssistantGuidanceService(workspaces,mock(AssistantV4Store.class),json,new AssistantCapabilityService(true));
        service.setupNavigation(mock(DishQueryService.class),mock(PersonalMenuService.class),mock(FavoriteDishService.class),mock(ShoppingListService.class),mock(MealConsumptionService.class),mock(UserPreferenceService.class));
        TurnScope scope=new TurnScope();scope.setUserId(7L);scope.setWorkspaceId("w");scope.setExpectedWorkspaceRevision(0L);scope.setExpectedPlanVersion(0L);scope.setTurnId("t");
        for(int index:Arrays.asList(0,1,3)) {
            Map<String,Object> intent=json.convertValue(results.get(index).path("output").path("navigationIntent"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
            assertEquals("handoff",service.resolveNavigation(7L,intent,scope,"查看设置").getType());
        }
        Map<String,Object> rejected=json.convertValue(json.valueToTree(cases.get(2)).path("navigationIntent"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
        assertThrows(IllegalArgumentException.class,()->service.resolveNavigation(7L,rejected,scope,"查看设置"));
        verify(workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
    }
}
