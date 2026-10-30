package com.eatwhat.service;
import com.eatwhat.dto.*;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.dto.AssistantActionContract.*;
import org.springframework.transaction.support.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class AssistantWorkspaceActionTest {
 @Test void partial_soft_patch_keeps_other_saved_meal_wishes() throws Exception {
  DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");w.getContext().setRecommendationPolicy("balanced-v1");w.getContext().getRecommendationPreferences().setCuisineCodes(Collections.singletonList("CANTONESE"));w.getContext().getRecommendationPreferences().setMaxCookMinutes(20);w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.f.sourceJson=f.f.json.writeValueAsString(w);
  DraftIntent intent=new DraftIntent();intent.setOperation("regenerate");intent.setSelectionMode("recommend");intent.setContextPatch(Collections.singletonMap("recommendationPreferences",Collections.singletonMap("includeTagCodes",Collections.singletonList("LIGHT"))));
  MealContext next=f.apply(intent,"partial-wishes").getContext();assertEquals(Collections.singletonList("CANTONESE"),next.getRecommendationPreferences().getCuisineCodes());assertEquals(20,next.getRecommendationPreferences().getMaxCookMinutes());assertEquals(Collections.singletonList("LIGHT"),next.getRecommendationPreferences().getIncludeTagCodes());
 }
 @Test void favorite_scope_keeps_explicitly_retained_nonfavorite() throws Exception {
  DraftFixture f=new DraftFixture();when(f.favorites.getFavoriteDishIds(1L)).thenReturn(Arrays.asList(1L,4L));DraftIntent i=new DraftIntent();i.setOperation("regenerate");i.setSelectionMode("recommend");i.setContextPatch(Collections.singletonMap("candidateScope","favorites"));
  MealWorkspace next=f.apply(i,"favorites-keep");assertEquals(new HashSet<>(Arrays.asList(1L,4L,3L)),new HashSet<>(next.getDraft().getDishes().stream().map(Dish::getId).collect(java.util.stream.Collectors.toList())));assertTrue(next.getDraft().getLockedDishIds().contains(3L));
 }
 @Test void upgrading_policy_alone_does_not_block_single_replacement() throws Exception {
  DraftFixture f=new DraftFixture();DraftIntent i=new DraftIntent();i.setOperation("adjust");i.setSelectionMode("recommend");i.setTargetDishId(2L);
  MealWorkspace next=f.apply(i,"replace-upgrade");assertEquals(Arrays.asList(1L,4L,3L),next.getDraft().getDishes().stream().map(Dish::getId).collect(java.util.stream.Collectors.toList()));
  assertEquals("balanced-v1",next.getContext().getRecommendationPolicy());
 }
 @Test void empty_assistant_snapshot_fails_before_any_dish_lock_query() throws Exception {
  DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");w.getDraft().setDishes(Collections.emptyList());f.f.sourceJson=f.f.json.writeValueAsString(w);
  assertThrows(IllegalArgumentException.class,()->f.f.service.assistantSnapshot(1L,"source"));verifyNoInteractions(f.f.validator);
 }
 @Test void legacy_configuration_only_history_does_not_offer_menu_undo() throws Exception {
  DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");PlanDraft prior=MealWorkspaceRules.copy(w.getDraft());prior.setContextSnapshot(null);w.getDraft().setHistory(Collections.singletonList(prior));w.getContext().setPeople(5);f.f.sourceJson=f.f.json.writeValueAsString(w);DraftIntent undo=new DraftIntent();undo.setOperation("undo");assertThrows(IllegalArgumentException.class,()->f.apply(undo,"legacy-undo"));assertEquals(5,f.service.get(1L,"source").getContext().getPeople());
 }
 @Test void structured_hard_exclusions_survive_partial_criteria_without_text() throws Exception {
  DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");w.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.f.sourceJson=f.f.json.writeValueAsString(w);
  DraftIntent i=new DraftIntent();i.setOperation("regenerate");i.setSelectedDishIds(Arrays.asList(1L,2L,3L));i.setContextPatch(Collections.singletonMap("criteria",Collections.singletonMap("maxCookMinutes",20)));
  assertEquals(Collections.singletonList("花生"),f.apply(i,"partial-criteria").getContext().getCriteria().getExcludedIngredients());
  i.setContextPatch(Collections.singletonMap("criteria",Collections.singletonMap("excludedIngredients",Collections.emptyList())));assertThrows(IllegalArgumentException.class,()->f.apply(i,"remove-exclusion"));
 }
 @Test void menu_undo_preserves_current_context_and_updates_its_fingerprint() throws Exception {
  WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();
  MealWorkspace w=f.json.readValue(f.sourceJson,MealWorkspace.class);
  MealContext old=f.json.convertValue(w.getContext(),MealContext.class);String fingerprint=MealWorkspaceRules.contextFingerprint(old);
  ObjectNode checkpoint=(ObjectNode)f.json.valueToTree(w.getDraft());checkpoint.set("contextSnapshot",f.json.valueToTree(old));
  w.getDraft().setHistory(Arrays.asList(f.json.treeToValue(checkpoint,PlanDraft.class)));
  Dish changed=f.json.convertValue(w.getDraft().getDishes().get(0),Dish.class);changed.setId(8L);changed.setName("新菜单");CanonicalTestDish.attach(changed);w.getDraft().setDishes(Collections.singletonList(changed));
  w.getContext().setPeople(5);w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.sourceJson=f.json.writeValueAsString(w);
  WorkspaceRequest r=f.request(null,null);r.setCommand("undo");
  MealWorkspace undone=f.service.mutate(1L,"source","command",r);
  assertEquals(5,undone.getContext().getPeople());assertEquals(MealWorkspaceRules.contextFingerprint(undone.getContext()),undone.getDraft().getContextFingerprint());assertFalse(undone.getDraft().isCanUndo());
  assertEquals(5L,undone.getRevision());assertEquals(4L,undone.getDraft().getPlanVersion());
 }
 @Test void balanced_generation_uses_server_sampling_without_model_selected_ids_and_undo_keeps_cycle() throws Exception {
  DraftFixture f=new DraftFixture();DraftIntent intent=new DraftIntent();intent.setOperation("generate");intent.setSelectionMode("recommend");
  MealWorkspace next=f.apply(intent,"balanced-generate");assertEquals(3,next.getDraft().getDishes().size());assertFalse(next.getRecommendationCycle().isEmpty());
  Map<String,Set<String>> cycle=next.getRecommendationCycle();DraftIntent undo=new DraftIntent();undo.setOperation("undo");MealWorkspace restored=f.apply(undo,"balanced-undo");assertEquals(cycle,restored.getRecommendationCycle());
 }
 static class DraftFixture {
  WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();
  MealWorkspaceService service;MealWorkspacePlanner planner;FavoriteDishService favorites=mock(FavoriteDishService.class);List<Dish> pool=new ArrayList<>();
  DraftFixture() throws Exception {
   for(long id=1;id<=4;id++){Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType("veg");d.setCl("青菜");d.setCookMinutes(id==4?5:15);CanonicalTestDish.attach(d);pool.add(d);}
   MealWorkspace w=f.service.get(1L,"source");w.getContext().setCounts(Collections.singletonMap("veg",3));w.getDraft().setDishes(new ArrayList<>(pool.subList(0,3)));w.getDraft().setLockedDishIds(new LinkedHashSet<>(Collections.singletonList(3L)));w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.sourceJson=f.json.writeValueAsString(w);
   DishCandidateQueryService query=mock(DishCandidateQueryService.class);DishMapper dishes=mock(DishMapper.class);UserPreferenceService preferences=mock(UserPreferenceService.class);RecommendationMetadataService metadata=mock(RecommendationMetadataService.class);
   when(preferences.get(1L)).thenReturn(new UserPreferenceDTO());when(favorites.getFavoriteDishIds(1L)).thenReturn(Collections.emptyList());when(metadata.validateCriteria(any())).thenReturn(Collections.emptyMap());
   when(query.detailsForFacts(anyLong(),anyList())).thenAnswer(call -> call.getArgument(1)); when(query.findRawForUser(eq(1L),isNull(),isNull(),any(),anyInt())).thenAnswer(i->{EffectiveRecommendationCriteria c=i.getArgument(3);List<Dish> out=new ArrayList<>();for(Dish d:pool)if(c.getMaxCookMinutes()==null||d.getCookMinutes()<=c.getMaxCookMinutes())out.add(d);return out;});
   when(dishes.lockReadableDishes(anyList(),eq(1L))).thenAnswer(i->{List<Long> ids=i.getArgument(0);List<Dish> out=new ArrayList<>();for(Dish d:pool)if(ids.contains(d.getId()))out.add(d);return out;});
   when(query.findSelectedForUser(eq(1L),anyList(),any())).thenAnswer(i->{List<Long> ids=i.getArgument(1);RecommendationCriteria c=i.getArgument(2);List<Dish> out=new ArrayList<>();for(Dish d:pool)if(ids.contains(d.getId())&&(c.getMaxCookMinutes()==null||d.getCookMinutes()<=c.getMaxCookMinutes()))out.add(d);return out;});
   planner=new MealWorkspacePlanner(query,dishes,preferences,metadata,favorites,f.actual,f.json);
   TransactionTemplate tx=mock(TransactionTemplate.class);when(tx.execute(any())).thenAnswer(i->((TransactionCallback<?>)i.getArgument(0)).doInTransaction(new SimpleTransactionStatus()));
   service=new MealWorkspaceService(f.db,f.actual,f.plans,new RecipeRecordService(f.plans,f.dishes),planner,f.json,tx);
  }
  DraftIntent replace(){DraftIntent i=new DraftIntent();i.setOperation("adjust");i.setTargetDishId(2L);i.setReplacementDishId(4L);i.setKeepDishIds(Collections.singletonList(1L));return i;}
  MealWorkspace apply(DraftIntent intent,String key){MealWorkspace w=service.get(1L,"source");return service.applyAssistantDraft(1L,"source",w.getRevision(),w.getDraft().getPlanVersion(),new ValidatedAssistantDraft(intent,new LinkedHashSet<>(Arrays.asList(1L,2L,3L,4L)),"session","step-1"),key,"turn");}
 }
 @Test void replace_second_keeps_other_dishes_and_locks() throws Exception {DraftFixture f=new DraftFixture();MealWorkspace w=f.apply(f.replace(),"replace-one");assertEquals(Arrays.asList(1L,4L,3L),w.getDraft().getDishes().stream().map(Dish::getId).collect(java.util.stream.Collectors.toList()));assertEquals(new HashSet<>(Arrays.asList(1L,3L)),w.getDraft().getLockedDishIds());assertEquals(1,w.getDraft().getHistory().size());assertEquals(4L,w.getDraft().getPlanVersion());}
 @Test void undo_only_latest_menu_change_skips_lock_changes_and_consumes_eligibility() throws Exception {DraftFixture f=new DraftFixture();f.apply(f.replace(),"one");DraftIntent keep=new DraftIntent();keep.setOperation("adjust");keep.setKeepDishIds(Collections.singletonList(4L));f.apply(keep,"two");DraftIntent undo=new DraftIntent();undo.setOperation("undo");MealWorkspace w=f.apply(undo,"three");assertFalse(w.getDraft().getLockedDishIds().contains(4L));assertEquals(2L,w.getDraft().getDishes().get(1).getId());assertTrue(w.getDraft().getHistory().isEmpty());assertFalse(w.getDraft().isCanUndo());assertEquals(6L,w.getDraft().getPlanVersion());}
 @Test void stale_revision_cannot_modify_new_menu() throws Exception {DraftFixture f=new DraftFixture();f.apply(f.replace(),"one");assertThrows(MealConsumptionService.VersionConflict.class,()->f.service.applyAssistantDraft(1L,"source",4L,3L,new ValidatedAssistantDraft(f.replace(),Collections.singleton(4L),"session","step-1"),"two","turn"));assertEquals(4L,f.service.get(1L,"source").getDraft().getDishes().get(1).getId());}
 @Test void target_limit_does_not_change_whole_meal() throws Exception {DraftFixture f=new DraftFixture();DraftIntent i=f.replace();RecommendationCriteria target=new RecommendationCriteria();target.setMaxCookMinutes(10);i.setTargetConstraints(target);MealWorkspace w=f.apply(i,"target-limit");assertNull(w.getContext().getCriteria().getMaxCookMinutes());assertEquals(15,w.getDraft().getDishes().get(0).getCookMinutes());assertEquals(5,w.getDraft().getDishes().get(1).getCookMinutes());}
 @Test void context_patch_requires_valid_regeneration() throws Exception {DraftFixture f=new DraftFixture();DraftIntent i=f.replace();i.setContextPatch(Collections.singletonMap("people",5));assertThrows(IllegalArgumentException.class,()->f.apply(i,"invalid-patch"));assertEquals(2,f.service.get(1L,"source").getContext().getPeople());}
 @Test void assistant_generation_never_calls_legacy_agent_and_menu_undo_keeps_current_people() throws Exception {DraftFixture f=new DraftFixture();DraftIntent i=new DraftIntent();i.setOperation("generate");i.setSelectedDishIds(Arrays.asList(1L,4L,3L));i.setContextPatch(Collections.singletonMap("people",5));MealWorkspace next=f.apply(i,"generate");assertEquals(5,next.getContext().getPeople());assertEquals(3,next.getDraft().getDishes().size());verify(f.f.db,never()).task(any());DraftIntent undo=new DraftIntent();undo.setOperation("undo");MealWorkspace restored=f.apply(undo,"undo");assertEquals(5,restored.getContext().getPeople());assertEquals(MealWorkspaceRules.contextFingerprint(restored.getContext()),restored.getDraft().getContextFingerprint());assertEquals(6L,restored.getRevision());}
 @Test void unauthorized_dish_and_model_provided_trust_are_rejected() throws Exception {DraftFixture f=new DraftFixture();assertThrows(IllegalArgumentException.class,()->f.service.applyAssistantDraft(1L,"source",4L,3L,new ValidatedAssistantDraft(f.replace(),Collections.emptySet(),"session","step-1"),"bad","turn"));DraftIntent i=f.replace();i.setContextPatch(Collections.singletonMap("userId",2));assertThrows(IllegalArgumentException.class,()->f.apply(i,"forged"));assertEquals(2L,f.service.get(1L,"source").getDraft().getDishes().get(1).getId());}
 @Test void changed_current_recipe_cannot_silently_replace_other_dish_content() throws Exception {DraftFixture f=new DraftFixture();f.pool.get(0).setCl("花生");CanonicalTestDish.attach(f.pool.get(0));assertThrows(MealConsumptionService.VersionConflict.class,()->f.apply(f.replace(),"changed-content"));assertEquals("青菜",f.service.get(1L,"source").getDraft().getDishes().get(0).getCl());}
 @Test void unknown_requirements_cannot_be_forged_or_erased() throws Exception {DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");w.getContext().setRequirements("不能吃花生");f.f.sourceJson=f.f.json.writeValueAsString(w);DraftIntent i=new DraftIntent();i.setOperation("generate");i.setSelectedDishIds(Arrays.asList(1L,2L,3L));assertThrows(IllegalArgumentException.class,()->f.apply(i,"unknown"));i.setContextPatch(Collections.singletonMap("requirements",""));assertThrows(IllegalArgumentException.class,()->f.apply(i,"erase"));} @Test void adapter_does_not_advance_workflow_and_persists_only_safe_server_cards() throws Exception {
  DraftFixture f=new DraftFixture();AssistantV4StoreTest p=new AssistantV4StoreTest();p.setup();when(p.workspaces.get(1L,"source")).thenAnswer(i->f.service.get(1L,"source"));
  com.eatwhat.dto.AssistantV4Contract.SessionRequest sr=new com.eatwhat.dto.AssistantV4Contract.SessionRequest();sr.setWorkspaceId("source");sr.setRequestId(UUID.randomUUID().toString());String session=p.store.createSession(1L,sr).getSessionId();
  com.eatwhat.dto.AssistantV4Contract.TurnRequest req=p.request();req.setWorkspaceId("source");req.setExpectedWorkspaceRevision(4L);req.setExpectedPlanVersion(3L);String turn=p.store.claimTurn(1L,session,req).getTurnId();com.eatwhat.dto.AssistantV4Contract.TurnRecord lease=p.store.acquireTurn(1L,turn);
  com.eatwhat.dto.AssistantV4Contract.ActionIntent action=new com.eatwhat.dto.AssistantV4Contract.ActionIntent();action.setKind("draft_update");Map<String,Object> args=new LinkedHashMap<>();args.put("operation","adjust");args.put("targetDishId",2L);args.put("replacementDishId",4L);args.put("keepDishIds",Collections.singletonList(1L));action.setArguments(args);
  com.eatwhat.dto.AssistantV4Contract.WorkflowContinuation workflow=com.eatwhat.dto.AssistantV4Contract.workflow(turn,Collections.singletonList(action));p.store.checkpointContinuation(1L,turn,lease.getLeaseToken(),workflow);
  com.eatwhat.dto.AssistantV4Contract.TurnScope scope=new com.eatwhat.dto.AssistantV4Contract.TurnScope();scope.setUserId(1L);scope.setSessionId(session);scope.setTurnId(turn);scope.setWorkspaceId("source");scope.setExpectedWorkspaceRevision(4L);scope.setExpectedPlanVersion(3L);scope.getAuthorizedDishIds().add(4L);
  WorkspaceAssistantToolAdapter adapter=new WorkspaceAssistantToolAdapter(f.service,p.store,f.f.json,new AssistantCapabilityService(true));com.eatwhat.dto.AssistantV4Contract.TurnResult result=adapter.execute(1L,workflow.getSteps().get(0),scope);
  assertEquals(0,p.store.continuation(1L,turn).getCursor());assertEquals("completed",result.getStatus());assertNotNull(result.getCards().get(0).getReceiptRef());assertEquals(5L,result.getWorkspaceRef().getWorkspaceRevision());assertFalse(f.f.json.writeValueAsString(result).contains("userId"));
  workflow.getSteps().get(0).setStatus("completed");workflow.getSteps().get(0).setReceiptRef(result.getCards().get(0).getReceiptRef());workflow.setCursor(1);result.setContinuation(workflow);
  assertEquals("completed",p.store.completeTurn(1L,turn,"running",lease.getLeaseToken(),result).getStatus());
 }
 @Test void fractional_ids_and_forged_nested_criteria_are_rejected_before_domain_access() throws Exception {
  ObjectMapper json=new ObjectMapper();
  assertThrows(IllegalArgumentException.class,()->WorkspaceAssistantToolAdapter.validateArguments(json.readTree("{\"operation\":\"adjust\",\"replacementDishId\":1.5}")));
  assertThrows(IllegalArgumentException.class,()->WorkspaceAssistantToolAdapter.validateArguments(json.readTree("{\"operation\":\"generate\",\"selectedDishIds\":[\"1\"]}")));
  assertThrows(IllegalArgumentException.class,()->WorkspaceAssistantToolAdapter.validateArguments(json.readTree("{\"operation\":\"generate\",\"contextPatch\":{\"criteria\":{\"understood\":true}}}")));
 } @Test void replay_returns_original_revision_without_reapplying_or_claiming_later_menu() throws Exception {DraftFixture f=new DraftFixture();DraftIntent first=f.replace();MealWorkspace saved=f.apply(first,"once");assertEquals(saved.getRevision(),f.apply(first,"once").getRevision());DraftIntent keep=new DraftIntent();keep.setOperation("adjust");keep.setKeepDishIds(Collections.singletonList(4L));f.apply(keep,"later");MealWorkspace replay=f.apply(first,"once");assertEquals(5L,replay.getRevision());assertEquals(6L,f.service.get(1L,"source").getRevision());assertTrue(replay.getDraft().getDishes().isEmpty());}
 @Test void interpreted_text_cannot_keep_trust_while_removing_its_hard_exclusions() throws Exception {DraftFixture f=new DraftFixture();MealWorkspace w=f.service.get(1L,"source");w.getContext().setRequirements("不要花生");w.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));w.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.f.sourceJson=f.f.json.writeValueAsString(w);DraftIntent i=new DraftIntent();i.setOperation("regenerate");i.setSelectedDishIds(Arrays.asList(1L,2L,3L));i.setContextPatch(Collections.singletonMap("criteria",Collections.singletonMap("excludedIngredients",Collections.emptyList())));assertThrows(IllegalArgumentException.class,()->f.apply(i,"relax"));assertEquals(Collections.singletonList("花生"),f.service.get(1L,"source").getContext().getCriteria().getExcludedIngredients());}}




