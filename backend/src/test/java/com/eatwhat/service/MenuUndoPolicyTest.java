package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import java.util.*;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MenuUndoPolicyTest {
    private DraftIntent adjust(Map<String,Object> patch){DraftIntent i=new DraftIntent();i.setOperation("adjust");i.setContextPatch(patch);return i;}
    private DraftIntent undo(){DraftIntent i=new DraftIntent();i.setOperation("undo");return i;}
    private List<Long> ids(MealWorkspace w){return w.getDraft().getDishes().stream().map(d->d.getId()).collect(Collectors.toList());}
    private boolean canUndo(AssistantWorkspaceActionTest.DraftFixture f,MealWorkspace w){return f.f.json.valueToTree(w.getDraft()).path("canUndo").asBoolean(false);}

    @Test void configurationAndLocksDoNotCreateMenuUndo(){
        assertDoesNotThrow(()->{AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();MealWorkspace configured=f.apply(adjust(Collections.singletonMap("people",4)),"configure-people");assertTrue(configured.getDraft().getHistory().isEmpty());assertFalse(canUndo(f,configured));DraftIntent keep=adjust(null);keep.setKeepDishIds(Collections.singletonList(1L));MealWorkspace locked=f.apply(keep,"configure-lock");assertTrue(locked.getDraft().getHistory().isEmpty());assertFalse(canUndo(f,locked));assertThrows(IllegalArgumentException.class,()->f.apply(undo(),"configuration-cannot-undo"));});
    }
    @Test void onlyTheLatestActualMenuChangeCanBeUndoneOnce() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();MealWorkspace b=f.apply(f.replace(),"menu-b");assertTrue(canUndo(f,b));DraftIntent c=new DraftIntent();c.setOperation("adjust");c.setTargetDishId(4L);c.setReplacementDishId(2L);MealWorkspace latest=f.apply(c,"menu-c");assertEquals(1,latest.getDraft().getHistory().size());MealWorkspace restored=f.apply(undo(),"one-menu-undo");assertEquals(ids(b),ids(restored));assertTrue(restored.getDraft().getHistory().isEmpty());assertFalse(canUndo(f,restored));assertEquals(latest.getDraft().getPlanVersion()+1,restored.getDraft().getPlanVersion());assertEquals(latest.getRevision()+1,restored.getRevision());assertEquals(restored.getRevision(),f.apply(undo(),"one-menu-undo").getRevision());assertThrows(IllegalArgumentException.class,()->f.apply(undo(),"no-undo-of-undo"));
    }
    @Test void menuUndoKeepsCurrentPeopleAndPreferencesAndSkipsConfigurationSnapshots() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();List<Long> original=ids(f.service.get(1L,"source"));f.apply(f.replace(),"changed-before-preferences");DraftIntent config=adjust(AssistantV4ContextService.map("people",8,"recommendationPreferences",Collections.singletonMap("includeTagCodes",Collections.singletonList("LIGHT"))));config.setSelectionMode("recommend");MealWorkspace configured=f.apply(config,"next-meal-wishes");assertEquals(Arrays.asList(1L,4L,3L),ids(configured));assertTrue(canUndo(f,configured));MealWorkspace restored=f.apply(undo(),"undo-menu-keep-wishes");assertEquals(original,ids(restored));assertEquals(8,restored.getContext().getPeople());assertEquals(Collections.singletonList("LIGHT"),restored.getContext().getRecommendationPreferences().getIncludeTagCodes());assertFalse(canUndo(f,restored));
    }
    @Test void nextPreferencesWithEitherOriginalIdFormNeverReselectOrChangeCounts() throws Exception {
        for(List<Long> selected:Arrays.asList(null,Arrays.asList(1L,2L))){AssistantWorkspaceActionTest.DraftFixture f=new AssistantPeoplePreservationTest().fixture("assistant");DraftIntent people=adjust(Collections.singletonMap("people",3));MealWorkspace first=f.apply(people,"people-before-wishes");DraftIntent wishes=adjust(Collections.singletonMap("recommendationPreferences",Collections.singletonMap("includeTagCodes",Collections.singletonList("LIGHT"))));wishes.setSelectionMode(selected==null?"recommend":"explicit");wishes.setSelectedDishIds(selected);MealWorkspace next=f.apply(wishes,"only-next-wishes");assertEquals(ids(first),ids(next));assertEquals(f.f.json.writeValueAsString(first.getDraft().getDishes()),f.f.json.writeValueAsString(next.getDraft().getDishes()));assertEquals(first.getContext().getCounts(),next.getContext().getCounts());assertEquals(3,next.getContext().getPeople());assertEquals(first.getDraft().getSource(),next.getDraft().getSource());assertEquals(first.getRecommendationCycle(),next.getRecommendationCycle());assertFalse(canUndo(f,next));assertTrue(next.getDraft().getHistory().isEmpty());}
    }
    @Test void legacyHistoryIsReducedToOneRealMenuDifferenceAndNeverRestoresConfiguration() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();MealWorkspace original=f.service.get(1L,"source");MealWorkspace changed=f.apply(f.replace(),"legacy-changed");PlanDraft configSnapshot=MealWorkspaceRules.copy(changed.getDraft());configSnapshot.setHistory(Collections.emptyList());configSnapshot.setContextSnapshot(f.f.json.convertValue(original.getContext(),MealContext.class));List<PlanDraft> history=new ArrayList<>(changed.getDraft().getHistory());history.add(configSnapshot);changed.getDraft().setHistory(history);changed.getContext().setPeople(8);f.f.sourceJson=f.f.json.writeValueAsString(changed);MealWorkspace read=f.service.get(1L,"source");assertEquals(1,read.getDraft().getHistory().size());assertTrue(canUndo(f,read));MealWorkspace restored=f.apply(undo(),"legacy-one-menu-undo");assertEquals(ids(original),ids(restored));assertEquals(8,restored.getContext().getPeople());assertFalse(canUndo(f,restored));
    }
    @Test void menuUndoStillRejectsAChangedRecipeSnapshot() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();MealWorkspace changed=f.apply(f.replace(),"menu-before-rejected-undo");f.pool.get(1).setName("原菜谱已经变化");CanonicalTestDish.attach(f.pool.get(1));assertThrows(MealConsumptionService.VersionConflict.class,()->f.apply(undo(),"guard-rejected-undo"));assertEquals(ids(changed),ids(f.service.get(1L,"source")));
    }
    @Test void nextHardConditionsNeverReselectOrBlockAnAuthorizedPreviousMenu() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();List<Long> previous=ids(f.service.get(1L,"source"));f.apply(f.replace(),"menu-before-next-hard-condition");DraftIntent config=adjust(Collections.singletonMap("criteria",Collections.singletonMap("maxCookMinutes",10)));MealWorkspace configured=f.apply(config,"next-hard-condition");assertTrue(canUndo(f,configured));MealWorkspace restored=assertDoesNotThrow(()->f.apply(undo(),"undo-menu-with-next-condition"));assertEquals(previous,ids(restored));assertEquals(10,restored.getContext().getCriteria().getMaxCookMinutes());assertFalse(canUndo(f,restored));
    }
    @Test void configurationCardCannotOfferUndoForAnOlderMenuButGlobalMenuEligibilityRemains() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();f.apply(f.replace(),"menu-before-config-card");
        TurnResult configuration=adapter(f,AssistantV4ContextService.map("operation","adjust","contextPatch",Collections.singletonMap("people",8)));
        assertTrue(f.service.get(1L,"source").getDraft().isCanUndo());assertEquals(false,configuration.getCards().get(0).getData().get("canUndo"));assertEquals("configuration",configuration.getCards().get(0).getData().get("changeKind"));assertNull(configuration.getPendingAction());assertFalse(configuration.getReply().contains("撤销"));
        TurnResult restored=adapter(f,Collections.singletonMap("operation","undo"));assertEquals(false,restored.getCards().get(0).getData().get("canUndo"));assertEquals("menu_undo",restored.getCards().get(0).getData().get("changeKind"));assertNull(restored.getPendingAction());assertEquals("completed",restored.getStatus());assertEquals("已恢复上一版菜单",restored.getReply());assertFalse(f.service.get(1L,"source").getDraft().isCanUndo());assertEquals(8,f.service.get(1L,"source").getContext().getPeople());
    }
    @Test void configurationCardHidesPriorGenerationExplanationWhileMenuCardKeepsIt() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        f.pool.forEach(d->d.setCuisineCode("CANTONESE"));
        MealWorkspace empty=f.service.get(1L,"source");empty.getDraft().setDishes(new ArrayList<>());empty.getDraft().setLockedDishIds(new LinkedHashSet<>());f.f.sourceJson=f.f.json.writeValueAsString(empty);
        TurnResult generated=adapter(f,AssistantV4ContextService.map("operation","generate","selectionMode","recommend","contextPatch",Collections.singletonMap("recommendationPreferences",Collections.singletonMap("cuisineCodes",Collections.singletonList("CANTONESE")))));
        MealWorkspace before=f.service.get(1L,"source");assertFalse(before.getDraft().getExplanations().isEmpty());
        assertEquals("menu",generated.getCards().get(0).getData().get("changeKind"));assertEquals(String.join("；",before.getDraft().getExplanations()),generated.getCards().get(0).getText());
        TurnResult configured=adapter(f,AssistantV4ContextService.map("operation","adjust","contextPatch",Collections.singletonMap("recommendationPreferences",Collections.singletonMap("includeTagCodes",Collections.singletonList("LIGHT")))));
        assertEquals("本餐设置已更新",configured.getCards().get(0).getTitle());assertNull(configured.getCards().get(0).getText());assertEquals(false,configured.getCards().get(0).getData().get("canUndo"));
        MealWorkspace after=f.service.get(1L,"source");assertEquals(before.getDraft().getExplanations(),after.getDraft().getExplanations());assertEquals(f.f.json.writeValueAsString(before.getDraft().getDishes()),f.f.json.writeValueAsString(after.getDraft().getDishes()));
    }
    private TurnResult adapter(AssistantWorkspaceActionTest.DraftFixture f,Map<String,Object> arguments) throws Exception {
        AssistantV4StoreTest p=new AssistantV4StoreTest();p.setup();when(p.workspaces.get(1L,"source")).thenAnswer(i->f.service.get(1L,"source"));MealWorkspace w=f.service.get(1L,"source");SessionRequest session=new SessionRequest();session.setWorkspaceId("source");session.setRequestId(UUID.randomUUID().toString());String sessionId=p.store.createSession(1L,session).getSessionId();TurnRequest request=p.request();request.setWorkspaceId("source");request.setExpectedWorkspaceRevision(w.getRevision());request.setExpectedPlanVersion(w.getDraft().getPlanVersion());String turn=p.store.claimTurn(1L,sessionId,request).getTurnId();TurnRecord lease=p.store.acquireTurn(1L,turn);ActionIntent action=new ActionIntent();action.setKind("draft_update");action.setArguments(arguments);WorkflowContinuation c=com.eatwhat.dto.AssistantV4Contract.workflow(turn,Collections.singletonList(action));p.store.checkpointContinuation(1L,turn,lease.getLeaseToken(),c);TurnScope scope=new TurnScope();scope.setUserId(1L);scope.setSessionId(sessionId);scope.setTurnId(turn);scope.setWorkspaceId("source");scope.setExpectedWorkspaceRevision(w.getRevision());scope.setExpectedPlanVersion(w.getDraft().getPlanVersion());return new WorkspaceAssistantToolAdapter(f.service,p.store,f.f.json,new AssistantCapabilityService(true)).execute(1L,c.getSteps().get(0),scope);
    }
}
