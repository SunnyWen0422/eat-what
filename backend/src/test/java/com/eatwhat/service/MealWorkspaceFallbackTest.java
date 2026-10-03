package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.WorkspaceTask;
import com.eatwhat.mapper.MealWorkspaceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MealWorkspaceFallbackTest {
    @Test void invalidSuggestedTargetRequiresInputAndCannotFallBackIntoOriginalMeal() throws Exception {
        MealWorkspace w=workspace();w.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));
        MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);MealWorkspaceService service=mock(MealWorkspaceService.class);
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);when(db.claim(eq("bad-target"),anyString())).thenReturn(1);
        MealWorkspaceAgentGateway agent=mock(MealWorkspaceAgentGateway.class);
        Map<String,Object> response=new HashMap<>();response.put("needsInput",true);
        Map<String,String> target=new HashMap<>();target.put("date","2026-99-99");target.put("mealType","dinner");response.put("suggestedTarget",target);
        when(agent.run(eq(1L),any())).thenReturn(response);
        ObjectMapper json=new ObjectMapper();WorkspaceRequest request=new WorkspaceRequest();request.setCommand("regenerate");
        Map<String,Object> input=new HashMap<>();input.put("workspace",w);input.put("request",request);
        WorkspaceTask task=new WorkspaceTask();task.setId("bad-target");task.setUserId(1L);task.setInputJson(json.writeValueAsString(input));
        MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(db,service,planner,agent,json,true);runner.execute(task);
        verifyNoInteractions(planner);verify(service).finish(eq(task),isNull(),isNull(),anyString(),eq("needs_input"));runner.close();
    }
    private MealWorkspace workspace() {
        MealContext c=new MealContext();c.setDate("2026-10-03");c.setRequirements("no peanut");
        c.getCriteria().setExcludedIngredients(Collections.singletonList("peanut"));
        MealWorkspace w=new MealWorkspace();w.setContext(MealWorkspaceRules.normalize(c));
        w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(c));
        w.getDraft().setLockedDishIds(new LinkedHashSet<>(Collections.singletonList(1L)));
        return w;
    }
    @Test void unparsedTextCannotBeDroppedToMakeRuleFallbackSucceed() {
        MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);
        MealWorkspaceService service=mock(MealWorkspaceService.class);
        MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(mock(MealWorkspaceMapper.class),service,planner,mock(MealWorkspaceAgentGateway.class),new ObjectMapper(),true);
        WorkspaceRequest command=new WorkspaceRequest();command.setCommand("regenerate");
        assertFalse(runner.tryRulesFallback(new WorkspaceTask(),workspace(),command));
        verifyNoInteractions(planner,service);runner.close();
    }
    @Test void previouslyValidatedCriteriaAndLocksRemainInFallback() {
        MealWorkspace w=workspace();w.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));
        MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);MealWorkspaceService service=mock(MealWorkspaceService.class);
        PlanDraft next=MealWorkspaceRules.copy(w.getDraft());
        when(planner.generate(1L,w,"regenerate",null,null)).thenReturn(next);
        MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(mock(MealWorkspaceMapper.class),service,planner,mock(MealWorkspaceAgentGateway.class),new ObjectMapper(),true);
        WorkspaceTask task=new WorkspaceTask();task.setUserId(1L);WorkspaceRequest command=new WorkspaceRequest();command.setCommand("regenerate");
        assertTrue(runner.tryRulesFallback(task,w,command));
        assertEquals(Collections.singletonList("peanut"),w.getContext().getCriteria().getExcludedIngredients());
        assertEquals(Collections.singleton(1L),next.getLockedDishIds());assertEquals("rules-fallback",next.getSource());
        verify(service).finish(eq(task),isNull(),eq(next),anyString(),eq("draft"));runner.close();
    }
}
