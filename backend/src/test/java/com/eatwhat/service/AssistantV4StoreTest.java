package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.mapper.AssistantV4Mapper;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.dto.MealWorkspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AssistantV4StoreTest {
    @Test void committed_calendar_is_durably_resumable_before_any_postcommit_listener(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);
        store.completeWorkflowStep(1L,id,"step-1","calendar-real",null);
        TurnView recovered=newStore().findTurn(1L,id);assertEquals("awaiting_confirmation",recovered.getStatus());assertTrue(recovered.isRetryable());assertNull(recovered.getPendingAction());assertEquals(1,recovered.getContinuation().getCursor());assertEquals("pending",recovered.getContinuation().getSteps().get(1).getStatus());assertEquals("calendar-real",recovered.getContinuation().getSteps().get(0).getReceiptRef());
    }
    AssistantV4Mapper db;MealConsumptionMapper locks;MealWorkspaceService workspaces;TransactionTemplate tx;
    AssistantV4Store store;Map<String,SessionRecord> sessions;Map<String,TurnRecord> turns;
    final long now=1800000000000L;
    @BeforeEach void setup(){
        db=mock(AssistantV4Mapper.class);locks=mock(MealConsumptionMapper.class);workspaces=mock(MealWorkspaceService.class);tx=mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(i->((org.springframework.transaction.support.TransactionCallback<?>)i.getArgument(0)).doInTransaction(new SimpleTransactionStatus()));
        sessions=new HashMap<>();turns=new HashMap<>();when(locks.lockUser(1L)).thenReturn(1L);
        MealWorkspace w=new MealWorkspace();w.setId("w");when(workspaces.get(1L,"w")).thenReturn(w);
        doAnswer(i->{SessionRecord r=i.getArgument(0);sessions.put(r.getId(),r);return 1;}).when(db).insertSession(any());
        when(db.session(anyLong(),anyString())).thenAnswer(i->{SessionRecord r=sessions.get(i.getArgument(1));return r!=null&&r.getUserId().equals(i.getArgument(0))?r:null;});
        when(db.sessionByRequest(anyLong(),anyString())).thenAnswer(i->sessions.values().stream().filter(r->r.getUserId().equals(i.getArgument(0))&&r.getRequestId().equals(i.getArgument(1))).findFirst().orElse(null));
        when(db.turn(anyLong(),anyString())).thenAnswer(i->{TurnRecord r=turns.get(i.getArgument(1));return r!=null&&r.getUserId().equals(i.getArgument(0))?r:null;});
        when(db.turnByRequest(anyLong(),anyString(),anyString())).thenAnswer(i->turns.values().stream().filter(r->r.getUserId().equals(i.getArgument(0))&&r.getSessionId().equals(i.getArgument(1))&&r.getRequestId().equals(i.getArgument(2))).findFirst().orElse(null));
        doAnswer(i->{TurnRecord r=i.getArgument(0);turns.put(r.getId(),r);return 1;}).when(db).insertTurn(any());
        when(db.acquire(anyLong(),anyString(),anyString(),anyLong(),anyLong())).thenAnswer(i->{TurnRecord r=turns.get(i.getArgument(1));if(!"queued".equals(r.getStatus()))return 0;r.setStatus("running");r.setLeaseToken(i.getArgument(2));r.setLeaseUntil(i.getArgument(3));r.setModelDeadlineAt(i.getArgument(4));return 1;});
        when(db.reserve(anyLong(),anyString(),anyString(),anyLong())).thenAnswer(i->{TurnRecord r=turns.get(i.getArgument(1));if(!"running".equals(r.getStatus())||!Objects.equals(r.getLeaseToken(),i.getArgument(2))||r.getProviderCallsUsed()>=4||r.getModelDeadlineAt()<=(Long)i.getArgument(3))return 0;r.setProviderCallsUsed(r.getProviderCallsUsed()+1);return 1;});
        when(db.save(any(),anyString(),nullable(String.class))).thenAnswer(i->{TurnRecord n=i.getArgument(0),r=turns.get(n.getId());if(r==null||!r.getStatus().equals(i.getArgument(1)))return 0;String lease=i.getArgument(2);if(lease!=null&&!Objects.equals(r.getLeaseToken(),lease))return 0;turns.put(n.getId(),n);return 1;});
        when(db.activeSessionTurns(anyLong(),anyString())).thenAnswer(i->{List<TurnRecord> rows=new ArrayList<>();for(TurnRecord r:turns.values())if(r.getUserId().equals(i.getArgument(0))&&r.getSessionId().equals(i.getArgument(1))&&Arrays.asList("queued","running","awaiting_confirmation").contains(r.getStatus()))rows.add(r);return rows;});
        when(db.deleteSession(anyLong(),anyString())).thenAnswer(i->{String id=i.getArgument(1);for(TurnRecord r:turns.values())if(id.equals(r.getSessionId()))assertTrue(com.eatwhat.dto.AssistantV4Contract.terminal(r.getStatus()),"cancel active tasks before deletion");sessions.remove(id);turns.values().removeIf(r->id.equals(r.getSessionId()));return 1;});
        store=newStore();
    }
    AssistantV4Store newStore(){return new AssistantV4Store(db,locks,workspaces,new ObjectMapper(),tx,Clock.fixed(Instant.ofEpochMilli(now),ZoneOffset.UTC));}
    String session(){SessionRequest r=new SessionRequest();r.setWorkspaceId("w");r.setRequestId(UUID.randomUUID().toString());return store.createSession(1L,r).getSessionId();}
    TurnRequest request(){TurnRequest r=new TurnRequest();r.setRequestId(UUID.randomUUID().toString());r.setWorkspaceId("w");r.setExpectedWorkspaceRevision(0L);r.setExpectedPlanVersion(0L);r.setEntryScene("chat");r.setMessage("晚餐");return r;}
    @Test void same_key_same_turn(){String s=session();TurnRequest r=request();String id=store.claimTurn(1L,s,r).getTurnId();assertEquals(id,store.claimTurn(1L,s,r).getTurnId());assertEquals(1,turns.size());}
    @Test void genuine_receipt_workspace_reference_advances_but_never_regresses_or_switches_scope(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);
        Card first=new Card();first.setReceiptRef("first");WorkspaceRef reference=new WorkspaceRef();reference.setWorkspaceId("w");reference.setWorkspaceRevision(5L);reference.setPlanVersion(3L);first.setWorkspaceRef(reference);
        store.completeWorkflowStep(1L,id,"step-1","first",first);assertEquals(5L,store.findTurn(1L,id).getWorkspaceRef().getWorkspaceRevision());
        Card stale=new Card();stale.setReceiptRef("second");WorkspaceRef old=new WorkspaceRef();old.setWorkspaceId("w");old.setWorkspaceRevision(4L);old.setPlanVersion(2L);stale.setWorkspaceRef(old);
        store.completeWorkflowStep(1L,id,"step-2","second",stale);assertEquals(5L,store.findTurn(1L,id).getWorkspaceRef().getWorkspaceRevision());
    }
    @Test void receipt_for_another_workspace_cannot_change_parent_scope(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);
        Card card=new Card();card.setReceiptRef("receipt");WorkspaceRef reference=new WorkspaceRef();reference.setWorkspaceId("other");reference.setWorkspaceRevision(99L);reference.setPlanVersion(99L);card.setWorkspaceRef(reference);
        store.completeWorkflowStep(1L,id,"step-1","receipt",card);assertEquals("w",store.findTurn(1L,id).getWorkspaceRef().getWorkspaceId());
    }
    @Test void same_key_different_body_409(){String s=session();TurnRequest r=request();store.claimTurn(1L,s,r);r.setMessage("午餐");assertEquals(409,assertThrows(ResponseStatusException.class,()->store.claimTurn(1L,s,r)).getRawStatusCode());}
    @Test void foreign_session_404(){String s=session();assertEquals(404,assertThrows(ResponseStatusException.class,()->store.sessionState(2L,s)).getRawStatusCode());}
    @Test void restart_recovers_without_new_command(){String s=session();TurnRequest r=request();String id=store.claimTurn(1L,s,r).getTurnId();assertEquals(id,newStore().claimTurn(1L,s,r).getTurnId());assertEquals(1,turns.size());}
    @Test void provider_reservation_survives_timeout_and_restart(){String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);assertEquals(1,store.reserveProviderCall(1L,id,lease.getLeaseToken()));assertEquals(2,newStore().reserveProviderCall(1L,id,lease.getLeaseToken()));newStore().reserveProviderCall(1L,id,lease.getLeaseToken());newStore().reserveProviderCall(1L,id,lease.getLeaseToken());assertThrows(ResponseStatusException.class,()->store.reserveProviderCall(1L,id,lease.getLeaseToken()));}
    @Test void cancelled_parent_rejects_late_write(){String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);store.cancelTurn(1L,id);assertThrows(ResponseStatusException.class,()->store.withActiveParent(1L,id,"step-1",()->"written"));TurnResult late=new TurnResult();late.setStatus("completed");assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"running",lease.getLeaseToken(),late));assertEquals("cancelled",store.findTurn(1L,id).getStatus());}
    @Test void foreign_turn_is_not_readable(){String id=store.claimTurn(1L,session(),request()).getTurnId();assertEquals(404,assertThrows(ResponseStatusException.class,()->store.findTurn(2L,id)).getRawStatusCode());}
    @Test void deleted_session_rejects_late_callback(){String session=session(),id=store.claimTurn(1L,session,request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);store.deleteSession(1L,session);assertThrows(ResponseStatusException.class,()->store.withActiveLease(1L,id,lease.getLeaseToken(),()->"write"));assertFalse(sessions.containsKey(session));assertFalse(turns.containsKey(id));}
    @Test void transient_provider_state_cannot_be_persisted_in_card(){String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);TurnResult r=new TurnResult();r.setStatus("completed");Card card=new Card();card.getData().put("reasoning_content","provider secret");r.getCards().add(card);assertThrows(IllegalArgumentException.class,()->store.completeTurn(1L,id,"running",lease.getLeaseToken(),r));card.getData().clear();card.getData().put("messages",Collections.singletonList(Collections.singletonMap("role","assistant")));assertThrows(IllegalArgumentException.class,()->store.completeTurn(1L,id,"running",lease.getLeaseToken(),r));assertEquals("running",store.findTurn(1L,id).getStatus());}
    @Test void preview_at_sixty_seconds_is_independent_of_model_deadline(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);store.reserveProviderCall(1L,id,lease.getLeaseToken());
        ActionIntent a=new ActionIntent();a.setKind("calendar_save");WorkflowContinuation c=com.eatwhat.dto.AssistantV4Contract.workflow(id,Collections.singletonList(a));
        store.checkpointContinuation(1L,id,lease.getLeaseToken(),c);c.getSteps().get(0).setStatus("awaiting_confirmation");
        PendingAction p=new PendingAction();p.setStepId("step-1");p.setTaskId("task");p.setPreviewToken("preview");p.setExpiresAt(now+600000);
        TurnResult r=new TurnResult();r.setStatus("awaiting_confirmation");r.setPendingAction(p);r.setContinuation(c);store.completeTurn(1L,id,"running",lease.getLeaseToken(),r);
        AssistantV4Store later=new AssistantV4Store(db,locks,workspaces,new ObjectMapper(),tx,Clock.fixed(Instant.ofEpochMilli(now+60000),ZoneOffset.UTC));
        assertEquals("saved",later.withActiveParent(1L,id,"step-1",()->"saved"));assertEquals(1,later.turnRecord(1L,id).getProviderCallsUsed());
        assertThrows(ResponseStatusException.class,()->later.reserveProviderCall(1L,id,lease.getLeaseToken()));
        AssistantV4Store expired=new AssistantV4Store(db,locks,workspaces,new ObjectMapper(),tx,Clock.fixed(Instant.ofEpochMilli(now+600001),ZoneOffset.UTC));
        assertThrows(ResponseStatusException.class,()->expired.withActiveParent(1L,id,"step-1",()->"write"));
    }
    @Test void completed_step_receipt_survives_cancel_and_restart(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);
        ActionIntent a=new ActionIntent();a.setKind("calendar_save");ActionIntent b=new ActionIntent();b.setKind("shopping_preview");
        WorkflowContinuation c=com.eatwhat.dto.AssistantV4Contract.workflow(id,Arrays.asList(a,b));store.checkpointContinuation(1L,id,lease.getLeaseToken(),c);
        store.completeWorkflowStep(1L,id,"step-1","domain-receipt",null);store.cancelTurn(1L,id);
        WorkflowContinuation recovered=newStore().continuation(1L,id);assertEquals("completed",recovered.getSteps().get(0).getStatus());assertEquals("domain-receipt",recovered.getSteps().get(0).getReceiptRef());assertEquals("cancelled",recovered.getSteps().get(1).getStatus());
    }
    @Test void cancel_after_calendar_keeps_real_draft_and_calendar_cards_but_removes_shopping_preview() throws Exception {
        String sessionId=session(),id=store.claimTurn(1L,sessionId,request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);
        List<ActionIntent> actions=new ArrayList<>();for(String kind:Arrays.asList("draft_update","calendar_save","shopping_preview")){ActionIntent action=new ActionIntent();action.setKind(kind);actions.add(action);}
        WorkflowContinuation workflow=com.eatwhat.dto.AssistantV4Contract.workflow(id,actions);store.checkpointContinuation(1L,id,lease.getLeaseToken(),workflow);
        Card draft=new Card();draft.setId("draft-card");draft.setType("recipe");draft.setReceiptRef("draft:actual-operation");draft.setTitle("本餐已调整");
        store.completeWorkflowStep(1L,id,"step-1",draft.getReceiptRef(),draft);
        Card calendar=new Card();calendar.setId("calendar-card");calendar.setType("receipt");calendar.setReceiptRef("calendar:actual-operation");calendar.setTitle("安排已保存");
        WorkspaceRef reference=new WorkspaceRef();reference.setWorkspaceId("w");reference.setWorkspaceRevision(5L);reference.setPlanVersion(3L);calendar.setWorkspaceRef(reference);
        store.completeWorkflowStep(1L,id,"step-2",calendar.getReceiptRef(),calendar);
        workflow=store.continuation(1L,id);String completedBefore=new ObjectMapper().writeValueAsString(workflow.getSteps().subList(0,2));workflow.getSteps().get(2).setStatus("awaiting_confirmation");workflow.getSteps().get(2).setTaskId("shopping-task");
        PendingAction pending=new PendingAction();pending.setStepId("step-3");pending.setTaskId("shopping-task");pending.setPreviewToken("shopping-preview");pending.setExpiresAt(now+600000);
        Card preview=new Card();preview.setId("shopping-card");preview.setType("shopping_preview");preview.setTaskId("shopping-task");preview.setPreviewToken("shopping-preview");
        Card unacknowledged=new Card();unacknowledged.setId("unacknowledged");unacknowledged.setType("receipt");unacknowledged.setReceiptRef("not-a-completed-operation");unacknowledged.setTitle("模型声称成功");
        TurnResult waiting=new TurnResult();waiting.setStatus("awaiting_confirmation");waiting.setContinuation(workflow);waiting.setPendingAction(pending);waiting.setWorkspaceRef(reference);waiting.setCards(Arrays.asList(draft,calendar,preview,unacknowledged));store.completeTurn(1L,id,"awaiting_confirmation",waiting);
        clearInvocations(workspaces);TurnView cancelled=store.cancelTurn(1L,id);
        assertEquals("cancelled",cancelled.getStatus());assertNull(cancelled.getPendingAction());assertFalse(cancelled.isRetryable());assertEquals(2,cancelled.getCards().size());
        assertEquals(Arrays.asList(draft.getReceiptRef(),calendar.getReceiptRef()),Arrays.asList(cancelled.getCards().get(0).getReceiptRef(),cancelled.getCards().get(1).getReceiptRef()));
        assertTrue(cancelled.getCards().stream().allMatch(card->card.getPreviewToken()==null));assertEquals(reference,cancelled.getWorkspaceRef());
        WorkflowContinuation after=store.continuation(1L,id);assertEquals(completedBefore,new ObjectMapper().writeValueAsString(after.getSteps().subList(0,2)));assertEquals("cancelled",after.getSteps().get(2).getStatus());
        assertEquals(cancelled.getCards(),newStore().findTurn(1L,id).getCards());verifyNoInteractions(workspaces);
        store.deleteSession(1L,sessionId);assertFalse(sessions.containsKey(sessionId));assertFalse(turns.containsKey(id));verifyNoInteractions(workspaces);
    }
    @Test void retention_removes_text_not_business_receipts(){store.purgeExpired();verify(db).purgeMessageText(now-30L*86400000);verify(db).purgeTerminalInputs(now-7L*86400000);verify(db).purgeTerminalMetadata(now-90L*86400000);verifyNoInteractions(workspaces);}
    TurnResult initialPreview(String id,TurnRecord lease){
        ActionIntent a=new ActionIntent();a.setKind("calendar_save");a.getArguments().put("date","2026-10-12");ActionIntent b=new ActionIntent();b.setKind("shopping_preview");
        WorkflowContinuation c=com.eatwhat.dto.AssistantV4Contract.workflow(id,Arrays.asList(a,b));store.checkpointContinuation(1L,id,lease.getLeaseToken(),c);c.getSteps().get(0).setStatus("awaiting_confirmation");
        PendingAction pending=new PendingAction();pending.setStepId("step-1");pending.setTaskId("calendar-task");pending.setPreviewToken("first-preview");pending.setExpiresAt(now+600000);
        TurnResult preview=new TurnResult();preview.setStatus("awaiting_confirmation");preview.setContinuation(c);preview.setPendingAction(pending);store.completeTurn(1L,id,"running",lease.getLeaseToken(),preview);return preview;
    }
    @Test void delayed_previous_preview_cannot_regress_completed_cursor_or_receipt(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);TurnResult stale=initialPreview(id,lease);
        store.completeWorkflowStep(1L,id,"step-1","real-domain-receipt",null);
        assertEquals(409,assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"awaiting_confirmation",stale)).getRawStatusCode());
        WorkflowContinuation current=store.continuation(1L,id);assertEquals(1,current.getCursor());assertEquals("real-domain-receipt",current.getSteps().get(0).getReceiptRef());assertNull(store.findTurn(1L,id).getPendingAction());
        stale.setContinuation(current);assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"awaiting_confirmation",stale),"a fresh revision cannot attach a prior step's preview");
    }
    @Test void freshly_read_workflow_still_cannot_mutate_intent_or_completed_receipt(){
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);store.completeWorkflowStep(1L,id,"step-1","receipt",null);
        TurnResult changed=new TurnResult();changed.setStatus("awaiting_confirmation");changed.setContinuation(store.continuation(1L,id));changed.getContinuation().getSteps().get(1).getArguments().put("dishId",999L);
        assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"awaiting_confirmation",changed));
        changed.setContinuation(store.continuation(1L,id));changed.getContinuation().getSteps().get(0).setReceiptRef("different");assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"awaiting_confirmation",changed));
        changed.setContinuation(null);assertThrows(ResponseStatusException.class,()->store.completeTurn(1L,id,"awaiting_confirmation",changed));
    }
    @Test void installed_schema_cleans_when_assistant_flag_is_disabled(){when(db.installedSchemaTables()).thenReturn(3);store.scheduledPurge();verify(db).purgeMessageText(now-30L*86400000);}
    @Test void absent_or_partial_schema_skips_all_assistant_table_access(){when(db.installedSchemaTables()).thenReturn(0,2);store.scheduledPurge();store.scheduledPurge();verify(db,times(2)).installedSchemaTables();verifyNoMoreInteractions(db);}
    @Test void old_unconfirmed_turn_in_active_session_loses_private_copies_but_keeps_receipt() throws Exception {
        String session=session(),id=store.claimTurn(1L,session,request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);store.completeWorkflowStep(1L,id,"step-1","calendar-receipt",null);
        TurnRecord old=turns.get(id);old.setCreatedAt(now-31L*86400000);old.setUpdatedAt(now-31L*86400000);sessions.get(session).setUpdatedAt(now);
        when(db.expiredActiveTurns(anyLong(),anyLong())).thenAnswer(i->{List<TurnRecord> expired=new ArrayList<>();for(TurnRecord r:turns.values())if(Arrays.asList("queued","running","awaiting_confirmation").contains(r.getStatus())&&r.getCreatedAt()<(Long)i.getArgument(1))expired.add(r);return expired;});
        doAnswer(i->{long before=i.getArgument(0);for(TurnRecord r:turns.values())if(r.getCreatedAt()<before){assertTrue(com.eatwhat.dto.AssistantV4Contract.terminal(r.getStatus()));r.setInputJson(null);r.setResultJson("{}");WorkflowContinuation c=new ObjectMapper().readValue(r.getContinuationJson(),WorkflowContinuation.class);for(WorkflowStep step:c.getSteps())step.getArguments().clear();r.setContinuationJson(new ObjectMapper().writeValueAsString(c));}return 1;}).when(db).purgeOldTurnText(anyLong());
        clearInvocations(workspaces);store.purgeExpired();assertTrue(sessions.containsKey(session));assertEquals("cancelled",store.findTurn(1L,id).getStatus());assertNull(turns.get(id).getInputJson());assertTrue(store.continuation(1L,id).getSteps().get(0).getArguments().isEmpty());assertEquals("calendar-receipt",store.continuation(1L,id).getSteps().get(0).getReceiptRef());verifyNoInteractions(workspaces);
    }
    @Test void abandoned_queue_running_lease_and_expired_preview_are_cancelled_under_parent_guard() throws Exception {
        String s=session();String queued=store.claimTurn(1L,s,request()).getTurnId();turns.get(queued).setCreatedAt(now-31L*86400000);
        String running=store.claimTurn(1L,s,request()).getTurnId();TurnRecord runLease=store.acquireTurn(1L,running);turns.get(running).setLeaseUntil(now-1);
        String awaiting=store.claimTurn(1L,s,request()).getTurnId();TurnRecord previewLease=store.acquireTurn(1L,awaiting);initialPreview(awaiting,previewLease);
        TurnRecord previewRow=turns.get(awaiting);ObjectMapper mapper=new ObjectMapper();TurnResult result=mapper.readValue(previewRow.getResultJson(),TurnResult.class);result.getPendingAction().setExpiresAt(now-1);previewRow.setResultJson(mapper.writeValueAsString(result));
        when(db.expiredActiveTurns(now,now-30L*86400000)).thenReturn(Arrays.asList(turns.get(queued),turns.get(running),previewRow));
        store.purgeExpired();for(String id:Arrays.asList(queued,running,awaiting))assertEquals("cancelled",store.findTurn(1L,id).getStatus());
        assertThrows(ResponseStatusException.class,()->store.withActiveLease(1L,running,runLease.getLeaseToken(),()->"write"));assertThrows(ResponseStatusException.class,()->store.withActiveParent(1L,awaiting,"step-1",()->"write"));
    }
    @Test void completing_second_step_preserves_prior_real_receipt_cards() {
        String id=store.claimTurn(1L,session(),request()).getTurnId();TurnRecord lease=store.acquireTurn(1L,id);initialPreview(id,lease);
        Card calendar=new Card();calendar.setType("receipt");calendar.setReceiptRef("calendar-real");calendar.setId("calendar-card");
        store.completeWorkflowStep(1L,id,"step-1","calendar-real",calendar);
        Card shopping=new Card();shopping.setType("receipt");shopping.setReceiptRef("shopping-real");shopping.setId("shopping-card");
        TurnView done=store.completeWorkflowStep(1L,id,"step-2","shopping-real",shopping);
        assertEquals(2,done.getCards().size());assertEquals("calendar-real",done.getCards().get(0).getReceiptRef());assertEquals("shopping-real",done.getCards().get(1).getReceiptRef());
    }}
