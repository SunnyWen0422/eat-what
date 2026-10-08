package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ControlledToolHarnessServiceTest {
    private static final Clock NOW = Clock.fixed(Instant.parse("2026-10-08T01:00:00Z"), ZoneOffset.UTC);
    private static Map<String,Object> map(Object... pairs) {
        Map<String,Object> out = new LinkedHashMap<>();
        for (int i=0;i<pairs.length;i+=2) out.put((String)pairs[i],pairs[i+1]);
        return out;
    }
    private static Map<String,Object> call(String tool, Map<String,Object> args) {return map("tool",tool,"arguments",args);}
    private static Map<String,Object> request(String key) {
        return map("requestId",key,"steps",Arrays.asList(
            call("confirm_current_meal",map("date","2026-10-08","mealType","lunch")),
            call("read_actual_diet_review",map("startDate","2026-10-05","endDate","2026-10-11"))));
    }
    private static TransactionTemplate transactions() {
        return new TransactionTemplate(new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction(){return new Object();}
            protected void doBegin(Object t,TransactionDefinition d){}
            protected void doCommit(DefaultTransactionStatus s){}
            protected void doRollback(DefaultTransactionStatus s){}
        });
    }
    private static class Fixture {
        final ControlledToolTaskMapper db=mock(ControlledToolTaskMapper.class);
        final MealConsumptionMapper locks=mock(MealConsumptionMapper.class);
        final MealWorkspaceService workspaces=mock(MealWorkspaceService.class);
        final MealConsumptionService actual=mock(MealConsumptionService.class);
        final ObjectMapper json=new ObjectMapper();
        final Map<String,Map<String,Object>> rows=new HashMap<>();
        final MealWorkspace workspace=new MealWorkspace();
        ControlledToolHarnessService service;
        Fixture() {
            when(locks.lockUser(anyLong())).thenAnswer(i->i.getArgument(0));
            when(db.find(anyLong(),anyString())).thenAnswer(i->rows.get(i.getArgument(0)+":"+i.getArgument(1)));
            when(db.byRequest(anyLong(),anyString())).thenAnswer(i->rows.values().stream().filter(r->Objects.equals(r.get("user"),i.getArgument(0))&&Objects.equals(r.get("requestId"),i.getArgument(1))).findFirst().orElse(null));
            when(db.insert(anyString(),anyLong(),anyString(),anyString(),anyString())).thenAnswer(i->{
                rows.put(i.getArgument(1)+":"+i.getArgument(0),map("user",i.getArgument(1),"requestId",i.getArgument(2),"requestHash",i.getArgument(3),"stateJson",i.getArgument(4)));return 1;
            });
            when(db.save(anyLong(),anyString(),anyString())).thenAnswer(i->{rows.get(i.getArgument(0)+":"+i.getArgument(1)).put("stateJson",i.getArgument(2));return 1;});
        }
        void initialize() {
            MealContext context=new MealContext();context.setDate("2026-10-08");context.setMealType("lunch");MealWorkspaceRules.normalize(context);
            workspace.setId("workspace-one");workspace.setRevision(3L);workspace.setContext(context);workspace.setStatus("draft");
            workspace.getDraft().setPlanVersion(2L);workspace.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(context));
            Dish dish=new Dish();dish.setId(7L);dish.setName("青菜");workspace.getDraft().setDishes(Collections.singletonList(dish));
            when(workspaces.current(1L,"2026-10-08","lunch")).thenReturn(workspace);
            when(workspaces.linked(eq(1L),any(MealWorkspace.class))).thenReturn(map("planRevision",4L,"plan",null));
            when(workspaces.mutate(eq(1L),eq("workspace-one"),eq("confirm"),any(WorkspaceRequest.class))).thenAnswer(i->{
                MealWorkspace saved=new MealWorkspace();saved.setId("workspace-one");saved.setRevision(4L);saved.setConfirmation(map("planRevision",5L));return saved;
            });
            when(actual.review(1L,"2026-10-05","2026-10-11")).thenReturn(map("mealCount",0,"description","仅统计实际"));
            service=new ControlledToolHarnessService(db,locks,workspaces,actual,json,transactions(),NOW);
        }
    }
    private Fixture fixture(){Fixture f=new Fixture();f.initialize();return f;}

    @Test void unknownToolsAndModelSuppliedIdentityFailBeforePersistence() {
        Fixture f=fixture();
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","one","steps",Collections.singletonList(call("run_sql",map("sql","DELETE FROM users"))))));
        Map<String,Object> spoof=request("two");spoof.put("userId",2L);
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,spoof));
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","three","steps",Collections.singletonList(call("confirm_current_meal",map("date","2026-10-08","mealType","lunch","user_id",2))))));
        verifyNoInteractions(f.db,f.workspaces,f.actual);
    }
    @Test void previewIsServerBoundAndNeverWritesThenConfirmationReturnsActualOnlyReport() {
        Fixture f=fixture();ControlledToolTask task=f.service.preview(1L,request("confirm-week"));
        assertEquals("awaiting_confirmation",task.status);assertNotNull(task.previewToken);assertTrue(task.summary.contains("不计入实际"));
        verify(f.workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
        ControlledToolTask done=f.service.confirm(1L,task.id,task.previewToken);
        assertEquals("completed",done.status);assertEquals(0,done.report.get("mealCount"));
        assertEquals("completed",done.steps.get(0).status);
        org.mockito.ArgumentCaptor<WorkspaceRequest> arg=org.mockito.ArgumentCaptor.forClass(WorkspaceRequest.class);
        verify(f.workspaces).mutate(eq(1L),eq("workspace-one"),eq("confirm"),arg.capture());
        assertEquals(3L,arg.getValue().getExpectedWorkspaceRevision());assertEquals(2L,arg.getValue().getPlanVersion());assertEquals(4L,arg.getValue().getExpectedPlanRevision());
        verify(f.actual,never()).save(anyLong(),anyString(),anyString(),any());
    }
    @Test void sameRequestReturnsDurableTaskAndDifferentContentRejectsReplay() {
        Fixture f=fixture();ControlledToolTask task=f.service.preview(1L,request("same"));
        assertEquals(task.id,f.service.preview(1L,request("same")).id);
        Map<String,Object> changed=map("requestId","same","steps",Collections.singletonList(call("read_actual_diet_review",map("startDate","2026-10-05","endDate","2026-10-11"))));
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.service.preview(1L,changed));
        assertEquals(task.id,f.service.byRequest(1L,"same").id);assertNull(f.service.byRequest(2L,"same"));
        assertThrows(IllegalArgumentException.class,()->f.service.get(2L,task.id));
        assertThrows(IllegalArgumentException.class,()->f.service.confirm(2L,task.id,task.previewToken));
        assertThrows(IllegalArgumentException.class,()->f.service.confirm(1L,task.id,"wrong-token"));
    }
    @Test void stalePreviewRejectsChangedWorkspaceAndTargetRevision() {
        Fixture f=fixture();ControlledToolTask task=f.service.preview(1L,request("stale"));f.workspace.setRevision(4L);
        ControlledToolTask rejected=f.service.confirm(1L,task.id,task.previewToken);
        assertEquals("failed",rejected.status);assertFalse(rejected.retryable);assertEquals("WORKFLOW_VERSION_CONFLICT",rejected.errorCode);
        verify(f.workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
        Fixture g=fixture();ControlledToolTask other=g.service.preview(1L,request("target"));
        when(g.workspaces.linked(eq(1L),any(MealWorkspace.class))).thenReturn(map("planRevision",5L,"plan",null));
        assertEquals("failed",g.service.confirm(1L,other.id,other.previewToken).status);
        verify(g.workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
    }
    @Test void contentTamperingWithoutRevisionChangeAndExpiredPreviewFailClosed() {
        Fixture f=fixture();ControlledToolTask task=f.service.preview(1L,request("content"));f.workspace.getDraft().getDishes().get(0).setName("变更");
        assertEquals("failed",f.service.confirm(1L,task.id,task.previewToken).status);
        Fixture g=fixture();ControlledToolTask expired=g.service.preview(1L,request("expired"));
        ControlledToolHarnessService later=new ControlledToolHarnessService(g.db,g.locks,g.workspaces,g.actual,g.json,transactions(),Clock.offset(NOW,Duration.ofMinutes(11)));
        assertEquals("PREVIEW_EXPIRED",later.confirm(1L,expired.id,expired.previewToken).errorCode);
        verify(g.workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
    }
    @Test void inFlightGenerationAndInvalidDraftCannotBePreviewed() {
        Fixture f=fixture();f.workspace.setStatus("generating");
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,request("generating")));
        f.workspace.setStatus("draft");f.workspace.getDraft().setContextFingerprint("old-context");
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,request("dirty")));
        verify(f.db,never()).insert(anyString(),anyLong(),anyString(),anyString(),anyString());
    }
    @Test void restartRecoversOnlyUnfinishedReportAndNeverRepeatsConfirmedWrite() {
        Fixture f=fixture();when(f.actual.review(anyLong(),anyString(),anyString())).thenThrow(new IllegalStateException("temporary DB failure")).thenReturn(map("mealCount",0));
        ControlledToolTask preview=f.service.preview(1L,request("recover"));
        ControlledToolTask partial=f.service.confirm(1L,preview.id,preview.previewToken);
        assertEquals("partial_failed",partial.status);assertTrue(partial.retryable);assertEquals("completed",partial.steps.get(0).status);assertNull(partial.report);
        ControlledToolHarnessService restarted=new ControlledToolHarnessService(f.db,f.locks,f.workspaces,f.actual,f.json,transactions(),Clock.offset(NOW,Duration.ofHours(2)));
        ControlledToolTask recovered=restarted.confirm(1L,preview.id,preview.previewToken);
        assertEquals("completed",recovered.status);assertEquals(0,recovered.report.get("mealCount"));
        assertEquals("completed",restarted.confirm(1L,preview.id,preview.previewToken).status);
        verify(f.workspaces,times(1)).mutate(anyLong(),anyString(),eq("confirm"),any());
        verify(f.actual,times(2)).review(anyLong(),anyString(),anyString());
    }
    @Test void registryBoundsShapesDatesAndWriteCountAndReadOnlyUsesActualService() {
        Fixture f=fixture();
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","shape","steps",Collections.emptyList())));
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","bad-date","steps",Collections.singletonList(call("read_current_meal",map("date","2026-02-30","mealType","lunch"))))));
        Map<String,Object> write=call("confirm_current_meal",map("date","2026-10-08","mealType","lunch"));
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","two-writes","steps",Arrays.asList(write,write))));
        assertThrows(IllegalArgumentException.class,()->f.service.preview(1L,map("requestId","too-many","steps",Arrays.asList(write,write,write,write))));
        ControlledToolTask task=f.service.preview(1L,map("requestId","read-only","steps",Collections.singletonList(call("read_actual_diet_review",map("startDate","2026-10-05","endDate","2026-10-11")))));
        assertEquals("completed",f.service.confirm(1L,task.id,task.previewToken).status);
        verify(f.workspaces,never()).mutate(anyLong(),anyString(),anyString(),any());
        verify(f.actual).review(1L,"2026-10-05","2026-10-11");
        assertEquals(3,ControlledToolRegistry.catalog().size());
    }
    @Test void taskReceiptFailureRollsBackWriteAndRestartReusesExactDomainRequest() {
        Fixture f=fixture();final int[] committedWrites={0};final List<String> domainRequests=new ArrayList<>();
        when(f.workspaces.mutate(anyLong(),anyString(),eq("confirm"),any())).thenAnswer(i->{
            committedWrites[0]++;domainRequests.add(((WorkspaceRequest)i.getArgument(3)).getRequestId());
            MealWorkspace saved=new MealWorkspace();saved.setId("workspace-one");saved.setRevision(4L);return saved;
        });
        TransactionTemplate transaction=new TransactionTemplate(new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction(){Map<String,Map<String,Object>> before=new HashMap<>();f.rows.forEach((k,v)->before.put(k,new LinkedHashMap<>(v)));return new Object[]{before,committedWrites[0]};}
            protected void doBegin(Object t,TransactionDefinition d){}
            protected void doCommit(DefaultTransactionStatus s){}
            @SuppressWarnings("unchecked") protected void doRollback(DefaultTransactionStatus s){Object[] before=(Object[])s.getTransaction();f.rows.clear();f.rows.putAll((Map<String,Map<String,Object>>)before[0]);committedWrites[0]=(Integer)before[1];}
        });
        f.service=new ControlledToolHarnessService(f.db,f.locks,f.workspaces,f.actual,f.json,transaction,NOW);
        ControlledToolTask task=f.service.preview(1L,request("atomic"));final boolean[] failed={false};
        doAnswer(i->{
            ControlledToolTask candidate=f.json.readValue((String)i.getArgument(2),ControlledToolTask.class);
            if(!failed[0]&&"completed".equals(candidate.steps.get(0).status)){failed[0]=true;throw new IllegalStateException("receipt unavailable");}
            f.rows.get(i.getArgument(0)+":"+i.getArgument(1)).put("stateJson",i.getArgument(2));return 1;
        }).when(f.db).save(anyLong(),anyString(),anyString());
        ControlledToolTask failedTask=f.service.confirm(1L,task.id,task.previewToken);
        assertEquals("failed",failedTask.status);assertEquals(0,committedWrites[0]);
        ControlledToolHarnessService restarted=new ControlledToolHarnessService(f.db,f.locks,f.workspaces,f.actual,f.json,transaction,NOW);
        assertEquals("completed",restarted.confirm(1L,task.id,task.previewToken).status);
        assertEquals(1,committedWrites[0]);assertEquals(2,domainRequests.size());assertEquals(domainRequests.get(0),domainRequests.get(1));
    }

}
