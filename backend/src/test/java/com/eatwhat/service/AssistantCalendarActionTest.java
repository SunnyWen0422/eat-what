package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.mapper.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AssistantCalendarActionTest {
 @Test void calendar_receipt_uses_record_date_instead_of_a_second_eaten_state() throws Exception {
  Fixture f=new Fixture();ControlledToolTask task=f.preview();
  ControlledToolTask saved=f.harness.confirm(1L,task.id,task.previewToken);
  Map<String,Object> result=saved.steps.get(0).result;
  assertEquals("calendar_records",result.get("reviewBasis"));
  assertEquals("2027-01-01",result.get("reviewFromDate"));
  assertFalse(result.containsKey("countsAsActual"));
  Map<?,?> card=(Map<?,?>)result.get("card"),data=(Map<?,?>)card.get("data");
  assertEquals("calendar_records",data.get("reviewBasis"));
  assertEquals("2027-01-01",data.get("reviewFromDate"));
 }
 @Test void native_json_roundtrip_of_display_decimals_does_not_change_the_reviewed_business_target() throws Exception {
  Fixture f=new Fixture();RecipeRecord old=new RecipeRecord();old.setId(90L);old.setRevision(2L);old.setRecipeName("原安排");
  Dish past=new Dish();past.setId(7L);past.setName("旧菜");CanonicalTestDish.attach(past);
  com.fasterxml.jackson.databind.node.ObjectNode recipe=past.getRecipe().deepCopy();recipe.putObject("calculatedNutrition").putObject("total").put("energyKcal",new java.math.BigDecimal("0.1234567890123456789012345"));past.setRecipe(recipe);old.setDishDetails(Collections.singletonList(past));f.domain.slots.put("2027-01-01|lunch",old);
  ControlledToolTask task=f.preview();ObjectMapper nativeJson=new ObjectMapper();
  // MySQL JSON stores its native numeric representation, unlike the target's historical TEXT snapshot.
  String stored=(String)f.rows.get(task.id).get("stateJson");f.rows.get(task.id).put("stateJson",nativeJson.writeValueAsString(nativeJson.readTree(stored)));
  ControlledToolTask saved=f.harness.confirm(1L,task.id,task.previewToken);
  assertEquals("completed",saved.status);assertEquals(3L,f.domain.slots.get("2027-01-01|lunch").getRevision());verify(f.domain.plans,times(1)).insert(any());
 }
 @Test void unchanged_revision_cannot_hide_a_changed_source_content_version() throws Exception {
  Fixture f=new Fixture();ControlledToolTask task=f.preview();MealWorkspace source=f.domain.service.get(1L,"source");source.getDraft().getDishes().get(0).restoreReceiptContentVersion(String.join("",Collections.nCopies(64,"a")));f.domain.sourceJson=f.domain.json.writeValueAsString(source);
  assertEquals("WORKFLOW_VERSION_CONFLICT",f.harness.confirm(1L,task.id,task.previewToken).errorCode);verify(f.domain.plans,never()).insert(any());
 }
 @Test void direct_permanent_failure_is_terminal_and_never_reconfirmed() throws Exception {
  for(boolean expired:Arrays.asList(false,true)){
   Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview(true);
   if(expired)f.initialize(f.persistence.now+600001);else{RecipeRecord changed=new RecipeRecord();changed.setRevision(1L);f.domain.slots.put("2027-01-01|lunch",changed);}
   AssistantCapabilityService capabilities=new AssistantCapabilityService(true);capabilities.configureExtensions(true,()->true);capabilities.registerUiFeature("direct_execution_v1");capabilities.registerRead("read_current_meal",(u,c,s)->new ReadResult());
   ControlledToolHarnessService harness=spy(f.harness);AssistantV4TurnService service=new AssistantV4TurnService(f.persistence.store,mock(AssistantV4ContextService.class),capabilities,mock(AssistantV4ModelGateway.class),mock(AiProtectionService.class),mock(DishQueryService.class),f.domain.json,Clock.fixed(Instant.ofEpochMilli(f.persistence.now),ZoneOffset.UTC),Runnable::run);service.setDirectHarness(harness);
   TurnView result=service.resumeWorkflow(1L,f.turnId);assertEquals("failed",result.getStatus());assertNull(result.getPendingAction());assertFalse(result.isRetryable());assertTrue(result.getReply().contains(expired?"过期":"变化"));service.resumeWorkflow(1L,f.turnId);verify(harness,times(1)).confirm(1L,task.id,task.previewToken);verify(f.domain.plans,never()).insert(any());
  }
 }
 static class Fixture {
  WorkspaceTargetSaveTest.Fixture domain=new WorkspaceTargetSaveTest.Fixture();
  AssistantV4StoreTest persistence=new AssistantV4StoreTest();
  ControlledToolTaskMapper tasks=mock(ControlledToolTaskMapper.class);
  Map<String,Map<String,Object>> rows=new LinkedHashMap<>();
  ControlledToolHarnessService harness;CalendarAssistantToolAdapter adapter;String turnId,sessionId;TurnRecord lease;WorkflowContinuation workflow;TurnScope scope;
  ObjectProvider<CalendarSavedListener> listeners=mock(ObjectProvider.class);ObjectProvider<AssistantV4TurnService> runner=mock(ObjectProvider.class);
  Fixture() throws Exception {persistence.setup();when(persistence.workspaces.get(1L,"source")).thenAnswer(i->domain.service.get(1L,"source"));
   when(tasks.find(anyLong(),anyString())).thenAnswer(i->Long.valueOf(1).equals(i.getArgument(0))?rows.get(i.getArgument(1)):null);
   when(tasks.byRequest(eq(1L),anyString())).thenAnswer(i->rows.values().stream().filter(r->i.getArgument(1).equals(r.get("requestId"))).findFirst().orElse(null));
   when(tasks.insert(anyString(),eq(1L),anyString(),anyString(),anyString())).thenAnswer(i->{Map<String,Object> row=new HashMap<>();row.put("requestId",i.getArgument(2));row.put("requestHash",i.getArgument(3));row.put("stateJson",i.getArgument(4));rows.put(i.getArgument(0),row);return 1;});
   when(tasks.save(eq(1L),anyString(),anyString())).thenAnswer(i->{rows.get(i.getArgument(1)).put("stateJson",i.getArgument(2));return 1;});
   when(listeners.orderedStream()).thenAnswer(i->Stream.empty());initialize(persistence.now);
  }
  void initialize(long now){harness=new ControlledToolHarnessService(tasks,persistence.locks,domain.service,mock(MealConsumptionService.class),domain.json,persistence.tx,Clock.fixed(Instant.ofEpochMilli(now),ZoneOffset.UTC));AssistantCapabilityService capabilities=new AssistantCapabilityService(true);capabilities.registerTurnExecutor((u,t)->{});capabilities.registerRead("read_current_meal",(u,c,scope)->new ReadResult());adapter=new CalendarAssistantToolAdapter(domain.service,harness,persistence.store,domain.json,capabilities,runner,listeners);}
  ControlledToolTask preview(){CalendarSaveIntent intent=new CalendarSaveIntent();intent.setSourceWorkspaceId("source");intent.setTargetDate("2027-01-01");intent.setTargetMealType("lunch");return adapter.prepareCalendar(1L,intent,"calendar-one");}
  ControlledToolTask workflowPreview(){return workflowPreview(false);}
  ControlledToolTask workflowPreview(boolean direct){SessionRequest sr=new SessionRequest();sr.setWorkspaceId("source");sr.setRequestId(UUID.randomUUID().toString());sessionId=persistence.store.createSession(1L,sr).getSessionId();TurnRequest request=persistence.request();if(direct)request.setUiFeatures(Collections.singletonList("direct_execution_v1"));request.setWorkspaceId("source");request.setExpectedWorkspaceRevision(4L);request.setExpectedPlanVersion(3L);turnId=persistence.store.claimTurn(1L,sessionId,request).getTurnId();lease=persistence.store.acquireTurn(1L,turnId);
   ActionIntent action=new ActionIntent();action.setKind("calendar_save");action.getArguments().put("targetDate","2027-01-01");action.getArguments().put("targetMealType","lunch");workflow=AssistantV4Contract.workflow(turnId,Collections.singletonList(action));persistence.store.checkpointContinuation(1L,turnId,lease.getLeaseToken(),workflow);
   scope=new TurnScope();scope.setUserId(1L);scope.setSessionId(sessionId);scope.setTurnId(turnId);scope.setWorkspaceId("source");scope.setExpectedWorkspaceRevision(4L);scope.setExpectedPlanVersion(3L);
   TurnResult result=adapter.execute(1L,workflow.getSteps().get(0),scope);workflow.getSteps().get(0).setStatus("awaiting_confirmation");workflow.getSteps().get(0).setTaskId(result.getPendingAction().getTaskId());result.setContinuation(workflow);persistence.store.completeTurn(1L,turnId,"running",lease.getLeaseToken(),result);return harness.get(1L,result.getPendingAction().getTaskId());
  }
 }
 @Test void direct_resume_uses_real_calendar_adapter_and_harness_idempotently() throws Exception {
  Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview(true);
  AssistantCapabilityService capabilities=new AssistantCapabilityService(true);capabilities.configureExtensions(true,()->true);capabilities.registerUiFeature("direct_execution_v1");capabilities.registerRead("read_current_meal",(u,c,s)->new ReadResult());
  AssistantV4TurnService service=new AssistantV4TurnService(f.persistence.store,mock(AssistantV4ContextService.class),capabilities,mock(AssistantV4ModelGateway.class),mock(AiProtectionService.class),mock(DishQueryService.class),f.domain.json,Clock.fixed(Instant.ofEpochMilli(f.persistence.now),ZoneOffset.UTC),Runnable::run);service.setDirectHarness(f.harness);when(f.runner.getIfAvailable()).thenReturn(service);
  assertEquals("completed",service.resumeWorkflow(1L,f.turnId).getStatus());assertEquals("completed",service.resumeWorkflow(1L,f.turnId).getStatus());assertEquals("completed",f.harness.get(1L,task.id).status);verify(f.domain.plans,times(1)).insert(any());assertNotNull(f.domain.slots.get("2027-01-01|lunch"));
 }
 @Test void occupied_target_shows_diff() throws Exception {Fixture f=new Fixture();RecipeRecord old=new RecipeRecord();old.setRevision(2L);old.setRecipeName("原来的汤");f.domain.slots.put("2027-01-01|lunch",old);ControlledToolTask task=f.preview();assertTrue(task.summary.contains("原来的汤"));assertTrue(task.summary.contains("菜单A"));assertFalse(task.summary.contains("版本"));assertEquals(2L,task.steps.get(0).binding.get("targetPlanRevision"));}
 @Test void source_or_target_changed_requires_preview() throws Exception {for(boolean source:Arrays.asList(true,false)){Fixture f=new Fixture();ControlledToolTask task=f.preview();if(source){MealWorkspace w=f.domain.service.get(1L,"source");w.setRevision(5L);f.domain.sourceJson=f.domain.json.writeValueAsString(w);}else{RecipeRecord old=new RecipeRecord();old.setRevision(1L);f.domain.slots.put("2027-01-01|lunch",old);}ControlledToolTask done=f.harness.confirm(1L,task.id,task.previewToken);assertEquals("WORKFLOW_VERSION_CONFLICT",done.errorCode);verify(f.domain.plans,never()).insert(any());}}
 @Test void same_confirm_returns_one_calendar_record_receipt() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();ControlledToolTask done=f.harness.confirm(1L,task.id,task.previewToken);assertEquals("completed",done.status);ObjectMapper canonical=new ObjectMapper().configure(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true);assertEquals(canonical.writeValueAsString(done.steps.get(0).result),canonical.writeValueAsString(f.harness.confirm(1L,task.id,task.previewToken).steps.get(0).result));assertFalse(done.steps.get(0).result.containsKey("countsAsActual"));assertEquals("calendar_records",done.steps.get(0).result.get("reviewBasis"));assertEquals("completed",f.persistence.store.findTurn(1L,f.turnId).getStatus());assertEquals(5L,f.persistence.store.findTurn(1L,f.turnId).getWorkspaceRef().getWorkspaceRevision(),"confirmation must advance the turn reference used by continuation");assertEquals("2026-12-31",f.domain.service.get(1L,"source").getContext().getDate());assertNotNull(f.domain.slots.get("2027-01-01|lunch"));verify(f.domain.plans,times(1)).insert(any());}
 @Test void cancelled_turn_preview_cannot_confirm() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();f.persistence.store.cancelTurn(1L,f.turnId);assertNotEquals("completed",f.harness.confirm(1L,task.id,task.previewToken).status);assertTrue(f.domain.slots.isEmpty());}
 @Test void deleted_session_preview_cannot_confirm() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();f.persistence.store.deleteSession(1L,f.sessionId);assertNotEquals("completed",f.harness.confirm(1L,task.id,task.previewToken).status);assertTrue(f.domain.slots.isEmpty());}
 @Test void confirm_after_60_seconds_before_10_minutes_is_valid() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();f.persistence.store=new AssistantV4Store(f.persistence.db,f.persistence.locks,f.persistence.workspaces,new ObjectMapper(),f.persistence.tx,Clock.fixed(Instant.ofEpochMilli(f.persistence.now+61000),ZoneOffset.UTC));f.initialize(f.persistence.now+61000);assertEquals("completed",f.harness.confirm(1L,task.id,task.previewToken).status);}
 @Test void expired_preview_cannot_write() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.preview();f.initialize(f.persistence.now+600001);assertEquals("PREVIEW_EXPIRED",f.harness.confirm(1L,task.id,task.previewToken).errorCode);assertTrue(f.domain.slots.isEmpty());}
 @Test void failed_post_save_listener_retries_without_repeating_calendar_write() throws Exception {Fixture f=new Fixture();CalendarSavedListener listener=mock(CalendarSavedListener.class);when(f.listeners.orderedStream()).thenAnswer(i->Stream.of(listener));doThrow(new IllegalStateException("temporary")).doNothing().when(listener).afterSaved(eq(1L),any());ControlledToolTask task=f.preview();ControlledToolTask saved=f.harness.confirm(1L,task.id,task.previewToken);assertEquals("completed",saved.status);assertTrue(saved.retryable);assertNotNull(f.domain.slots.get("2027-01-01|lunch"));assertEquals("completed",f.harness.confirm(1L,task.id,task.previewToken).status);verify(listener,times(2)).afterSaved(eq(1L),any());verify(f.domain.plans,times(1)).insert(any());}
 @Test void tomorrow_uses_now_not_selected_target() throws Exception {AssistantV4ContextTest.Fixture context=new AssistantV4ContextTest.Fixture();ModelContext model=context.service().build(7L,context.request,context.session);assertEquals("2026-12-25",((Map<?,?>)model.getRequestContext().get("selectedTarget")).get("date"));String tomorrow=OffsetDateTime.parse((String)model.getRequestContext().get("now")).toLocalDate().plusDays(1).toString();assertEquals("2026-10-12",tomorrow);Fixture f=new Fixture();CalendarSaveIntent intent=new CalendarSaveIntent();intent.setSourceWorkspaceId("source");intent.setTargetDate(tomorrow);intent.setTargetMealType("dinner");ControlledToolTask preview=f.adapter.prepareCalendar(1L,intent,"tomorrow");assertEquals("2026-10-12",preview.steps.get(0).binding.get("targetDate"));assertEquals("2026-12-31",preview.steps.get(0).binding.get("sourceDate"));}
 @Test void completed_receipt_replays_after_session_deletion() throws Exception {Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();ControlledToolTask done=f.harness.confirm(1L,task.id,task.previewToken);f.persistence.store.deleteSession(1L,f.sessionId);ControlledToolTask replay=f.harness.confirm(1L,task.id,task.previewToken);assertEquals("completed",replay.status);assertEquals(done.steps.get(0).result.get("receiptRef"),replay.steps.get(0).result.get("receiptRef"));assertFalse(replay.retryable);verify(f.domain.plans,times(1)).insert(any());} @Test void disabled_assistant_blocks_pending_calendar_but_preserves_completed_receipt() throws Exception {
  Fixture f=new Fixture();ControlledToolTask task=f.workflowPreview();
  f.harness=new ControlledToolHarnessService(f.tasks,f.persistence.locks,f.domain.service,mock(MealConsumptionService.class),f.domain.json,f.persistence.tx,Clock.fixed(Instant.ofEpochMilli(f.persistence.now),ZoneOffset.UTC));
  new CalendarAssistantToolAdapter(f.domain.service,f.harness,f.persistence.store,f.domain.json,new AssistantCapabilityService(false),f.runner,f.listeners);
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->f.harness.confirm(1L,task.id,task.previewToken));
  assertEquals("awaiting_confirmation",f.harness.get(1L,task.id).status);assertTrue(f.domain.slots.isEmpty());
  f.initialize(f.persistence.now);ControlledToolTask done=f.harness.confirm(1L,task.id,task.previewToken);
  f.harness=new ControlledToolHarnessService(f.tasks,f.persistence.locks,f.domain.service,mock(MealConsumptionService.class),f.domain.json,f.persistence.tx,Clock.fixed(Instant.ofEpochMilli(f.persistence.now),ZoneOffset.UTC));
  new CalendarAssistantToolAdapter(f.domain.service,f.harness,f.persistence.store,f.domain.json,new AssistantCapabilityService(false),f.runner,f.listeners);
  clearInvocations(f.listeners,f.runner);
  // Replayed receipts cross the JSON persistence boundary; compare every wire field.
  assertEquals(f.domain.json.readTree(f.domain.json.writeValueAsString(done.steps.get(0).result)),f.domain.json.readTree(f.domain.json.writeValueAsString(f.harness.confirm(1L,task.id,task.previewToken).steps.get(0).result)));
  verifyNoInteractions(f.listeners,f.runner);verify(f.domain.plans,times(1)).insert(any());
 }
}




