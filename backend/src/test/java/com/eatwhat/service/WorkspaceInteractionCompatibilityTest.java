package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Pure rules, static JSON and transaction/mapper boundaries. No planner method,
 * model runtime/gateway, Spring context, network or live database is executed. */
class WorkspaceInteractionCompatibilityTest {
    static class Fixture {
        final ObjectMapper json=new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);
        final MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);
        final MealConsumptionMapper actual=mock(MealConsumptionMapper.class);
        final RecipeRecordMapper plans=mock(RecipeRecordMapper.class);
        final RecipeRecordService records=mock(RecipeRecordService.class);
        final MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);
        final List<WorkspaceTask> tasks=new ArrayList<>();
        final Map<String,Map<String,Object>> receipts=new HashMap<>();
        String state;boolean failSave;int commits,rollbacks;
        final MealWorkspaceService service;
        Fixture() throws Exception {
            Dish dish=new Dish();dish.setId(7L);dish.setName("青菜");dish.setType("veg");
            MealContext context=new MealContext();context.setDate("2026-10-06");context.setMealType("dinner");MealWorkspaceRules.normalize(context);
            MealWorkspace w=new MealWorkspace();w.setId("w");w.setRevision(4L);w.setContext(context);w.setStatus("draft");w.getDraft().setPlanVersion(3L);w.getDraft().getDishes().add(dish);w.getDraft().getLockedDishIds().add(7L);w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(context));state=json.writeValueAsString(w);
            when(actual.lockUser(1L)).thenReturn(1L);
            when(db.find("w",1L)).thenAnswer(i->{WorkspaceRow r=new WorkspaceRow();r.setStateJson(state);return r;});
            when(db.slot(1L,"2026-10-06","dinner")).thenAnswer(i->{WorkspaceRow r=new WorkspaceRow();r.setStateJson(state);return r;});
            when(db.save(eq("w"),eq(1L),anyLong(),anyLong(),anyString())).thenAnswer(i->{if(failSave)return 0;state=i.getArgument(4);return 1;});
            doAnswer(i->{tasks.add(i.getArgument(0));return 1;}).when(db).task(any(WorkspaceTask.class));
            when(db.request(eq(1L),anyString())).thenAnswer(i->receipts.get(i.getArgument(1)));
            when(db.log(eq(1L),anyString(),anyString(),anyString())).thenAnswer(i->{Map<String,Object> receipt=new HashMap<>();receipt.put("requestHash",i.getArgument(2));receipt.put("responseJson",i.getArgument(3));receipts.put(i.getArgument(1),receipt);return 1;});
            TransactionTemplate tx=new TransactionTemplate(new AbstractPlatformTransactionManager(){
                String before;List<WorkspaceTask> beforeTasks;Map<String,Map<String,Object>> beforeReceipts;
                protected Object doGetTransaction(){return new Object();}
                protected void doBegin(Object o,TransactionDefinition d){before=state;beforeTasks=new ArrayList<>(tasks);beforeReceipts=new HashMap<>(receipts);}
                protected void doCommit(DefaultTransactionStatus s){commits++;}
                protected void doRollback(DefaultTransactionStatus s){state=before;tasks.clear();tasks.addAll(beforeTasks);receipts.clear();receipts.putAll(beforeReceipts);rollbacks++;}
            });
            service=new MealWorkspaceService(db,actual,plans,records,planner,json,tx);
        }
        WorkspaceRequest request(String command,boolean release) throws Exception {
            return json.readValue("{\"requestId\":\"action-one\",\"expectedWorkspaceRevision\":4,\"planVersion\":3,\"command\":\""+command+"\",\"dishId\":7"+(release?",\"releaseLegacyLocks\":true":"")+"}",WorkspaceRequest.class);
        }
        MealWorkspace command(String kind,boolean release) throws Exception {return service.mutate(1L,"w","command",request(kind,release));}
        MealWorkspace read() throws Exception {return json.readValue(state,MealWorkspace.class);}
    }
    @Test void legacyLocksStayVisibleUntilAtomicCommand() throws Exception {
        Fixture f=new Fixture();assertEquals(Collections.singleton(7L),f.service.current(1L,"2026-10-06","dinner").getDraft().getLockedDishIds());assertEquals(0,f.commits);verify(f.db,never()).save(anyString(),anyLong(),anyLong(),anyLong(),anyString());
        MealWorkspace accepted=f.command("replace",true);assertTrue(accepted.getDraft().getLockedDishIds().isEmpty());assertEquals(1,f.tasks.size());assertEquals(1,f.commits);
        MealWorkspace input=f.json.treeToValue(f.json.readTree(f.tasks.get(0).getInputJson()).get("workspace"),MealWorkspace.class);
        assertTrue(input.getDraft().getLockedDishIds().isEmpty());assertEquals(3L,input.getDraft().getPlanVersion());assertEquals(Collections.singleton(7L),input.getDraft().getHistory().get(0).getLockedDishIds());
        verifyNoInteractions(f.planner,f.plans,f.records);
    }
    @Test void newInteractionsReleaseLocksOnlyOnAcceptedVersion() throws Exception {
        for(String command:Arrays.asList("generate","regenerate","replace","select")) {
            Fixture f=new Fixture();WorkspaceRequest r=f.request(command,true);r.setExpectedWorkspaceRevision(2L);String before=f.state;
            assertThrows(MealConsumptionService.VersionConflict.class,()->f.service.mutate(1L,"w","command",r));assertEquals(before,f.state);assertTrue(f.tasks.isEmpty());
            r.setExpectedWorkspaceRevision(4L);r.setPlanVersion(2L);assertThrows(MealConsumptionService.VersionConflict.class,()->f.service.mutate(1L,"w","command",r));assertEquals(before,f.state);
            assertTrue(f.command(command,true).getDraft().getLockedDishIds().isEmpty());verifyNoInteractions(f.planner,f.plans,f.records);
        }
    }
    @Test void failedAtomicWriteRollsBackUnlockQueueAndReceipt() throws Exception {
        Fixture f=new Fixture();String before=f.state;f.failSave=true;
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.command("replace",true));assertEquals(before,f.state);assertTrue(f.tasks.isEmpty());assertTrue(f.receipts.isEmpty());assertEquals(1,f.rollbacks);assertEquals(0,f.commits);
    }
    @Test void originalLockedSnapshotRemainsInHistoryWithoutDuplicateMenuUndo() throws Exception {
        Fixture f=new Fixture();PlanDraft original=f.read().getDraft();PlanDraft prepared=f.command("replace",true).getDraft();
        Dish nextDish=new Dish();nextDish.setId(9L);nextDish.setName("西兰花");nextDish.setType("veg");
        PlanDraft next=new PlanDraft();next.getDishes().add(nextDish);PlanDraft changed=MealWorkspaceRules.advance(prepared,next);
        assertEquals(1,changed.getHistory().size());assertEquals(original.getLockedDishIds(),changed.getHistory().get(0).getLockedDishIds());assertEquals(7L,changed.getHistory().get(0).getDishes().get(0).getId());assertEquals(4L,changed.getPlanVersion());
    }
    @Test void compatibleUndoRestoresDishesButNeverResurrectsInvisibleLocksOrWritesCalendar() throws Exception {
        Fixture f=new Fixture();MealWorkspace w=f.read();PlanDraft old=MealWorkspaceRules.copy(w.getDraft());old.setHistory(new ArrayList<>());w.getDraft().getHistory().add(old);w.getDraft().getDishes().get(0).setName("西兰花");w.getDraft().getLockedDishIds().clear();f.state=f.json.writeValueAsString(w);
        MealWorkspace undone=f.command("undo",true);assertEquals("青菜",undone.getDraft().getDishes().get(0).getName());assertTrue(undone.getDraft().getLockedDishIds().isEmpty());assertEquals(4L,undone.getDraft().getPlanVersion());verifyNoInteractions(f.planner,f.plans,f.records);
    }
    @Test void oldClientsKeepReleaseUndoAndQueuedLocksRetainTheirBehavior() throws Exception {
        Fixture f=new Fixture();assertFalse(f.command("release",false).getDraft().getLockedDishIds().contains(7L));
        Fixture keep=new Fixture();assertTrue(keep.command("keep",false).getDraft().getLockedDishIds().contains(7L));
        Fixture queued=new Fixture();assertTrue(queued.command("replace",false).getDraft().getLockedDishIds().contains(7L));
        PlanDraft locked=queued.read().getDraft();PlanDraft changed=MealWorkspaceRules.copy(locked);changed.getDishes().get(0).setName("另一个菜");changed.getHistory().add(locked);assertTrue(MealWorkspaceRules.command(changed,"undo",null,null).getLockedDishIds().contains(7L));
    }
    @Test void missingOptionalFieldKeepsOldRequestHashAndReplay() throws Exception {
        Fixture f=new Fixture();WorkspaceRequest request=f.request("keep",false);JsonNode serialized=f.json.readTree(f.json.writeValueAsString(request));assertFalse(serialized.has("releaseLegacyLocks"));
        MealWorkspace accepted=f.service.mutate(1L,"w","command",request);String oldHash=WorkflowRequestHash.sha256("command|w|"+f.json.writeValueAsString(serialized));assertEquals(oldHash,f.receipts.get("action-one").get("requestHash"));
        assertEquals(accepted.getRevision(),f.service.mutate(1L,"w","command",request).getRevision());verify(f.db,times(1)).save(anyString(),anyLong(),anyLong(),anyLong(),anyString());
    }
    @Test void replayOfAcceptedCompatibilityRequestNeverCreatesAnotherTask() throws Exception {
        Fixture f=new Fixture();WorkspaceRequest request=f.request("replace",true);MealWorkspace accepted=f.service.mutate(1L,"w","command",request);
        assertEquals(accepted.getRevision(),f.service.mutate(1L,"w","command",request).getRevision());assertEquals(1,f.tasks.size());verify(f.db,times(1)).save(anyString(),anyLong(),anyLong(),anyLong(),anyString());
    }
}
