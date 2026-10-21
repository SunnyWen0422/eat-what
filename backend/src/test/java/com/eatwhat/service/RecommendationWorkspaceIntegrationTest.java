package com.eatwhat.service;
import com.eatwhat.dto.*;import com.eatwhat.entity.*;import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;import org.springframework.transaction.*;import org.springframework.transaction.support.*;
import java.util.*;import static org.junit.jupiter.api.Assertions.*;import static org.mockito.Mockito.*;
class RecommendationWorkspaceIntegrationTest {
    @Test void homeInterpreterMergesOnlyChangedWishesAndPreservesIndependentHardGroups() throws Exception {
        MealWorkspace w=new MealWorkspace();MealContext c=new MealContext();c.setDate("2026-10-21");c.setRecommendationPolicy("balanced-v1");c.setRequirements("清淡一些，必须蒸");c.getCriteria().setIncludeTagCodes(Arrays.asList("LIGHT"));c.getRecommendationPreferences().setCuisineCodes(Arrays.asList("CANTONESE"));c.getRecommendationPreferences().setMaxCookMinutes(20);c.setExpectedTotalCookMinutes(40);c.setCandidateScope("favorites");w.setContext(c);
        MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);BalancedRecommendationPolicy policy=new BalancedRecommendationPolicy(new RecommendationMetadataService(mock(DishMapper.class)));
        when(planner.mergeRequiredTags(anyList(),anyList())).thenAnswer(i->policy.mergeRequiredTags(i.getArgument(0),i.getArgument(1)));when(planner.generate(eq(1L),any(),eq("generate"),isNull(),isNull())).thenReturn(new PlanDraft());
        MealWorkspaceService service=mock(MealWorkspaceService.class);MealWorkspaceAgentGateway agent=mock(MealWorkspaceAgentGateway.class);Map<String,Object> response=new HashMap<>();response.put("needsInput",false);response.put("constraintsUnderstood",true);response.put("dishIds",Collections.emptyList());response.put("criteria",Collections.singletonMap("includeTagCodes",Arrays.asList("STEAM")));response.put("recommendationPreferences",Collections.singletonMap("includeTagCodes",Arrays.asList("LIGHT")));when(agent.run(eq(1L),any())).thenReturn(response);
        WorkspaceRequest request=new WorkspaceRequest();request.setCommand("generate");Map<String,Object> input=new HashMap<>();input.put("workspace",w);input.put("request",request);WorkspaceTask task=task();task.setInputJson(json.writeValueAsString(input));when(db.claimQueued(eq("task"),anyString())).thenReturn(1);
        MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(db,service,planner,agent,json,true);try{runner.execute(task);}finally{runner.close();}
        org.mockito.ArgumentCaptor<MealContext> interpreted=org.mockito.ArgumentCaptor.forClass(MealContext.class);verify(service).finish(eq(task),interpreted.capture(),any(PlanDraft.class),anyString(),eq("draft"));MealContext result=interpreted.getValue();
        assertEquals(Arrays.asList("LIGHT","STEAM"),result.getCriteria().getIncludeTagCodes());assertEquals(Arrays.asList("CANTONESE"),result.getRecommendationPreferences().getCuisineCodes());assertEquals(20,result.getRecommendationPreferences().getMaxCookMinutes());assertEquals(40,result.getExpectedTotalCookMinutes());assertEquals("favorites",result.getCandidateScope());
    }
    private final ObjectMapper json=new ObjectMapper();
    private final MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);private final MealConsumptionMapper locks=mock(MealConsumptionMapper.class);
    private MealWorkspace state;
    private MealWorkspaceService service() throws Exception {
        state=new MealWorkspace();state.setId("test");MealContext c=new MealContext();c.setDate("2026-10-21");state.setContext(c);state.setStatus("generating");state.setTaskId("task");
        when(locks.lockUser(1L)).thenReturn(1L);when(db.find("test",1L)).thenAnswer(i->{WorkspaceRow r=new WorkspaceRow();r.setRevision(state.getRevision());r.setStateJson(json.writeValueAsString(state));return r;});
        when(db.save(anyString(),anyLong(),anyLong(),anyLong(),anyString())).thenAnswer(i->{state=json.readValue((String)i.getArgument(4),MealWorkspace.class);return 1;});when(db.finish(anyString(),anyString(),anyString(),anyString())).thenReturn(1);
        TransactionTemplate tx=new TransactionTemplate(new AbstractPlatformTransactionManager(){protected Object doGetTransaction(){return new Object();}protected void doBegin(Object t,TransactionDefinition d){}protected void doCommit(DefaultTransactionStatus s){}protected void doRollback(DefaultTransactionStatus s){}});
        return new MealWorkspaceService(db,locks,mock(RecipeRecordMapper.class),mock(RecipeRecordService.class),mock(MealWorkspacePlanner.class),json,tx);
    }
    private WorkspaceTask task(){WorkspaceTask t=new WorkspaceTask();t.setId("task");t.setWorkspaceId("test");t.setUserId(1L);t.setBaseRevision(0L);t.setLeaseToken("lease");return t;}
    @Test void onlyCommittedGenerationPublishesRotationAndReplayDoesNotConsumeAgain() throws Exception {
        MealWorkspaceService s=service();PlanDraft draft=new PlanDraft();draft.setCycleAfterSelection(Collections.singletonMap("veg",new LinkedHashSet<>(Arrays.asList("菜一"))));
        s.finish(task(),null,draft,"ok","draft");assertEquals(new HashSet<>(Arrays.asList("菜一")),state.getRecommendationCycle().get("veg"));
        draft.setCycleAfterSelection(Collections.singletonMap("veg",new LinkedHashSet<>(Arrays.asList("菜二"))));s.finish(task(),null,draft,"ok","draft");assertFalse(state.getRecommendationCycle().get("veg").contains("菜二"));
    }
    @Test void cancelledGenerationNeverPublishesRotation() throws Exception {
        MealWorkspaceService s=service();state.setStatus("draft");PlanDraft draft=new PlanDraft();draft.setCycleAfterSelection(Collections.singletonMap("veg",new HashSet<>(Arrays.asList("菜一"))));s.finish(task(),null,draft,"ok","draft");assertTrue(state.getRecommendationCycle().isEmpty());verify(db,never()).save(any(),any(),any(),any(),any());
    }
    @Test void newPolicyKeepsWishesOutOfHardFiltersAndLegacyStillHasItsOriginalMeaning(){
        MealContext c=new MealContext();c.getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));UserPreferenceDTO saved=new UserPreferenceDTO();saved.setMaxCookMinutes(20);c.getCriteria().setExcludedIngredients(Arrays.asList("花生"));
        RecommendationCriteriaResolver resolver=new RecommendationCriteriaResolver();assertEquals(20,resolver.resolveMeal(c,saved).getMaxCookMinutes());
        c.setRecommendationPolicy(BalancedRecommendationPolicy.VERSION);assertNull(resolver.resolveMeal(c,saved).getMaxCookMinutes());assertTrue(resolver.resolveMeal(c,saved).getIncludeTagCodes().isEmpty());assertEquals(Arrays.asList("花生"),resolver.resolveMeal(c,saved).getExcludedIngredients());
        c.getCriteria().setMaxCookMinutes(10);assertEquals(10,resolver.resolveMeal(c,saved).getMaxCookMinutes());
    }
}
