package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.context.annotation.AnnotationConfigUtils;
import org.springframework.transaction.support.*;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkspaceTaskDispatchTest {
    static class Manager extends AbstractPlatformTransactionManager {
        volatile boolean failCommit;
        protected Object doGetTransaction(){return new Object();}
        protected void doBegin(Object value,TransactionDefinition definition){}
        protected void doCommit(DefaultTransactionStatus status){if(failCommit)throw new IllegalStateException("synthetic commit failure");}
        protected void doRollback(DefaultTransactionStatus status){}
    }
    static class Fixture implements AutoCloseable {
        final MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);
        final MealConsumptionMapper users=mock(MealConsumptionMapper.class);
        final MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);
        final Manager manager=new Manager();final ObjectMapper json=new ObjectMapper();
        final MealWorkspaceService service=new MealWorkspaceService(db,users,mock(RecipeRecordMapper.class),mock(RecipeRecordService.class),planner,json,new TransactionTemplate(manager));
        final MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(db,service,planner,mock(MealWorkspaceAgentGateway.class),json,true);
        final GenericApplicationContext context=new GenericApplicationContext();
        final CountDownLatch claimed=new CountDownLatch(1);final List<WorkspaceTask> created=new CopyOnWriteArrayList<>();
        Fixture()throws Exception {
            AnnotationConfigUtils.registerAnnotationConfigProcessors(context);
            context.registerBean(TransactionalEventListenerFactory.class);
            context.getBeanFactory().registerSingleton("personalMenus",mock(PersonalMenuService.class));
            context.registerBean(MealWorkspaceService.class,()->service);
            context.registerBean(MealWorkspaceTaskRunner.class,()->runner);context.refresh();
            when(users.lockUser(7L)).thenReturn(7L);
            when(db.request(anyLong(),anyString())).thenReturn(null);
            MealWorkspace workspace=new MealWorkspace();workspace.setId("owned-workspace");MealContext meal=new MealContext();meal.setDate("2031-01-01");meal.setMealType("dinner");workspace.setContext(meal);
            WorkspaceRow row=new WorkspaceRow();row.setRevision(0L);row.setStateJson(json.writeValueAsString(workspace));when(db.find("owned-workspace",7L)).thenReturn(row);
            when(db.save(anyString(),anyLong(),anyLong(),anyLong(),anyString())).thenReturn(1);
            doAnswer(call->{WorkspaceTask task=call.getArgument(0);task.setCreatedAt(new Date());created.add(task);return 1;}).when(db).task(any());
            when(db.pending()).thenAnswer(call->new ArrayList<>(created));
            when(db.taskById(anyString(),eq("owned-workspace"),eq(7L))).thenAnswer(call->created.stream().filter(t->t.getId().equals(call.getArgument(0))).findFirst().orElse(null));
            when(db.claimQueued(anyString(),anyString())).thenAnswer(call->{claimed.countDown();return 0;});
        }
        MealWorkspace generate(){WorkspaceRequest r=new WorkspaceRequest();r.setRequestId(UUID.randomUUID().toString());r.setExpectedWorkspaceRevision(0L);r.setPlanVersion(0L);r.setCommand("generate");return service.mutate(7L,"owned-workspace","commands",r);}
        public void close(){context.close();runner.close();}
    }
    @Test void committed_task_is_dispatched_without_waiting_for_the_recovery_poll()throws Exception {
        try(Fixture f=new Fixture()) {
            MealWorkspace w=f.generate();
            assertTrue(f.claimed.await(2,TimeUnit.SECONDS),"A committed task must wake the existing executor without a poll");
            verify(f.db).pending();verify(f.db).claimQueued(eq(w.getTaskId()),anyString());
            verify(f.db,never()).taskById(any(),any(),any());
            ThreadPoolExecutor executor=(ThreadPoolExecutor)ReflectionTestUtils.getField(f.runner,"executor");
            assertEquals(2,executor.getMaximumPoolSize());assertEquals(8,executor.getQueue().remainingCapacity()+executor.getQueue().size());
        }
    }
    @Test void rollback_or_failed_commit_cannot_dispatch_a_task()throws Exception {
        try(Fixture f=new Fixture()) {
            f.manager.failCommit=true;assertThrows(IllegalStateException.class,f::generate);
            assertFalse(f.claimed.await(100,TimeUnit.MILLISECONDS));verify(f.db,never()).pending();
        }
        try(Fixture f=new Fixture()) {
            when(f.db.save(anyString(),anyLong(),anyLong(),anyLong(),anyString())).thenReturn(0);
            assertThrows(RuntimeException.class,f::generate);assertFalse(f.claimed.await(100,TimeUnit.MILLISECONDS));
            verify(f.db,never()).claimQueued(any(),any());verify(f.db,never()).pending();
        }
    }
    @Test void duplicate_notifications_share_the_existing_bound_and_rejection_remains_pollable()throws Exception {
        try(Fixture f=new Fixture()) {
            CountDownLatch entered=new CountDownLatch(2),release=new CountDownLatch(1);
            when(f.db.claimQueued(anyString(),anyString())).thenAnswer(call->{entered.countDown();release.await(2,TimeUnit.SECONDS);return 0;});
            java.util.concurrent.atomic.AtomicReference<List<WorkspaceTask>> pending=new java.util.concurrent.atomic.AtomicReference<>(Collections.emptyList());
            when(f.db.pending()).thenAnswer(call->pending.get());
            try {
                for(int index=0;index<11;index++){
                    WorkspaceTask task=new WorkspaceTask();task.setId("task-"+index);task.setWorkspaceId("owned-workspace");task.setUserId(7L);
                    pending.set(Collections.singletonList(task));
                    MealWorkspaceTaskRunner.Ready event=new MealWorkspaceTaskRunner.Ready("task-"+index,"owned-workspace",7L);
                    f.runner.ready(event);f.runner.ready(event);
                    if(index==1)assertTrue(entered.await(1,TimeUnit.SECONDS));
                }
                assertTrue(entered.await(1,TimeUnit.SECONDS));
                ThreadPoolExecutor executor=(ThreadPoolExecutor)ReflectionTestUtils.getField(f.runner,"executor");
                assertEquals(8,executor.getQueue().size());assertEquals(2,executor.getActiveCount());
                Set<?> submitted=(Set<?>)ReflectionTestUtils.getField(f.runner,"submitted");
                assertEquals(10,submitted.size());assertFalse(submitted.contains("task-10"));
            } finally{release.countDown();}
            ThreadPoolExecutor executor=(ThreadPoolExecutor)ReflectionTestUtils.getField(f.runner,"executor");
            executor.shutdown();assertTrue(executor.awaitTermination(3,TimeUnit.SECONDS));
            assertTrue(((Set<?>)ReflectionTestUtils.getField(f.runner,"submitted")).isEmpty());
            verify(f.db,times(10)).claimQueued(anyString(),anyString());
        }
    }
    @Test void cancelled_identity_never_runs_the_planner_or_changes_another_task()throws Exception {
        try(Fixture f=new Fixture()) {
            WorkspaceTask cancelled=new WorkspaceTask();cancelled.setId("cancelled");cancelled.setWorkspaceId("owned-workspace");cancelled.setUserId(7L);cancelled.setStatus("cancelled");
            when(f.db.pending()).thenReturn(Collections.singletonList(cancelled));
            f.runner.ready(new MealWorkspaceTaskRunner.Ready("cancelled","owned-workspace",7L));
            assertTrue(f.claimed.await(2,TimeUnit.SECONDS));
            ThreadPoolExecutor executor=(ThreadPoolExecutor)ReflectionTestUtils.getField(f.runner,"executor");executor.shutdown();assertTrue(executor.awaitTermination(2,TimeUnit.SECONDS));
            verifyNoInteractions(f.planner);verify(f.db).claimExpired(eq("cancelled"),anyString());
            verify(f.db,never()).cancel(any(),any(),any());assertEquals(0,executor.getActiveCount());
        }
    }
    @Test void new_notification_cannot_bypass_an_older_persisted_task_from_another_account()throws Exception {
        try(Fixture f=new Fixture()) {
            // Control executor delivery, not time: the older authorized row is
            // already durable before the new task's after-commit notification.
            ThreadPoolExecutor controlled=mock(ThreadPoolExecutor.class);
            List<Runnable> offered=new ArrayList<>();
            doAnswer(call->{offered.add(call.getArgument(0));return null;}).when(controlled).execute(any(Runnable.class));
            ReflectionTestUtils.setField(f.runner,"executor",controlled);
            WorkspaceTask older=new WorkspaceTask();older.setId("older-task");older.setWorkspaceId("older-workspace");older.setUserId(8L);older.setStatus("queued");older.setCreatedAt(new Date(1000));
            WorkspaceTask newer=new WorkspaceTask();newer.setId("newer-task");newer.setWorkspaceId("owned-workspace");newer.setUserId(7L);newer.setStatus("queued");newer.setCreatedAt(new Date(2000));
            f.created.add(newer);
            when(f.db.pending()).thenReturn(Arrays.asList(older,newer));
            List<String> claims=new ArrayList<>();
            when(f.db.claimQueued(anyString(),anyString())).thenAnswer(call->{claims.add(call.getArgument(0));return 0;});
            f.runner.ready(new MealWorkspaceTaskRunner.Ready(newer.getId(),newer.getWorkspaceId(),newer.getUserId()));
            for(Runnable job:offered)job.run();
            assertFalse(claims.isEmpty(),"The notification must actually wake work");
            assertEquals(Arrays.asList("older-task","newer-task"),claims,"Wakeup must use the existing durable pending order, not jump the newly notified identity ahead of old work");
            assertTrue(((Set<?>)ReflectionTestUtils.getField(f.runner,"submitted")).isEmpty());
        }
    }
}
