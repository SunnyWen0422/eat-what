package com.eatwhat.service;

import com.eatwhat.mapper.MealWorkspaceMapper;
import com.eatwhat.entity.WorkspaceTask;
import com.eatwhat.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.test.util.ReflectionTestUtils;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** A foreign task is deliberately locked in a different connection. Cancellation
 * of this owner's workspace must complete without waiting on the foreign task. */
@EnabledIfEnvironmentVariable(named="EATWHAT_TASK_CANCEL_TEST",matches="1")
class WorkspaceTaskCancellationMysqlIT {
    private UnpooledDataSource ds;
    private SqlSessionFactory factory;
    @BeforeEach void newOwnedTable()throws Exception{
        String url=System.getenv("EATWHAT_TASK_CANCEL_JDBC");
        assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_task_test_[a-f0-9]{10}\\?.*"));
        ds=new UnpooledDataSource("com.mysql.cj.jdbc.Driver",url,"root",System.getenv("EATWHAT_TASK_CANCEL_PASSWORD"));
        try(Connection setup=ds.getConnection();Statement sql=setup.createStatement()){
            sql.execute("DROP TABLE IF EXISTS workspace_task");
            sql.execute("CREATE TABLE workspace_task(id VARCHAR(36) PRIMARY KEY,workspace_id VARCHAR(36) NOT NULL,user_id BIGINT NOT NULL,base_revision BIGINT NOT NULL DEFAULT 0,status VARCHAR(32) NOT NULL,input_json JSON NOT NULL,lease_token VARCHAR(36),result_json JSON,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY ix_task_poll(status,updated_at),KEY ix_task_owner(user_id,workspace_id)) ENGINE=InnoDB");
        }
        Configuration config=new Configuration(new Environment("owned-task-cancel",new JdbcTransactionFactory(),ds));config.addMapper(MealWorkspaceMapper.class);
        factory=new SqlSessionFactoryBuilder().build(config);
    }
    private void task(String status,boolean expired)throws Exception{
        try(Connection connection=ds.getConnection();PreparedStatement insert=connection.prepareStatement("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json,lease_token,updated_at) VALUES('claim','owned',7,?,'{}','old',DATE_SUB(NOW(),INTERVAL ? SECOND))")){
            insert.setString(1,status);insert.setInt(2,expired?31:0);insert.executeUpdate();
        }
    }
    private void raceClaims(boolean expired)throws Exception{
        task(expired?"running":"queued",expired);
        CyclicBarrier start=new CyclicBarrier(2);ExecutorService pool=Executors.newFixedThreadPool(2);
        List<Future<Integer>> claims=new ArrayList<>();
        try{
            for(String lease:Arrays.asList("owner-a","owner-b"))claims.add(pool.submit(()->{
                try(SqlSession session=factory.openSession(true)){
                    start.await(5,TimeUnit.SECONDS);MealWorkspaceMapper mapper=session.getMapper(MealWorkspaceMapper.class);
                    return expired?mapper.claimExpired("claim",lease):mapper.claimQueued("claim",lease);
                }
            }));
            assertEquals(1,claims.get(0).get(10,TimeUnit.SECONDS)+claims.get(1).get(10,TimeUnit.SECONDS),"Exactly one concurrent lease may win");
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(10,TimeUnit.SECONDS));}
        try(SqlSession check=factory.openSession(true)){
            MealWorkspaceMapper mapper=check.getMapper(MealWorkspaceMapper.class);
            assertEquals(0,mapper.claimQueued("claim","late"));assertEquals(0,mapper.claimExpired("claim","late"));
            assertEquals(0,mapper.finish("claim","old","draft","{}"),"Superseded lease cannot publish");
        }
    }
    @Test void competingQueuedClaimsHaveOneWinner()throws Exception{raceClaims(false);}
    @Test void competingExpiredRunningClaimsHaveOneWinner()throws Exception{raceClaims(true);}
    @Test void staleQueuedSnapshotMustRecoverAsExpiredAndOldOwnerCannotFinish()throws Exception{
        task("queued",false);
        try(SqlSession session=factory.openSession(true);SqlSession recoveredSession=factory.openSession(true)){
            MealWorkspaceMapper mapper=session.getMapper(MealWorkspaceMapper.class);
            MealWorkspaceMapper recoveredMapper=recoveredSession.getMapper(MealWorkspaceMapper.class);
            ObjectMapper json=new ObjectMapper();MealWorkspace workspace=new MealWorkspace();workspace.setContext(new MealContext());
            WorkspaceRequest request=new WorkspaceRequest();request.setCommand("select");
            Map<String,Object> input=new HashMap<>();input.put("workspace",workspace);input.put("request",request);
            try(PreparedStatement update=session.getConnection().prepareStatement("UPDATE workspace_task SET input_json=?,created_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id='claim'")){
                update.setString(1,json.writeValueAsString(input));update.executeUpdate();
            }
            // Both pollers captured queued DTOs before either winner claimed in MySQL.
            WorkspaceTask initial=mapper.taskById("claim","owned",7L),stale=recoveredMapper.taskById("claim","owned",7L);
            assertNotSame(initial,stale,"Independent pollers must not share a MyBatis session-cached DTO");
            assertEquals("queued",initial.getStatus());assertEquals("queued",stale.getStatus());
            MealWorkspaceService service=mock(MealWorkspaceService.class);MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);
            MealWorkspaceAgentGateway agent=mock(MealWorkspaceAgentGateway.class);
            SimpleMeterRegistry registry=new SimpleMeterRegistry();ExperienceMetrics metrics=new ExperienceMetrics(registry);
            MealWorkspaceTaskRunner first=new MealWorkspaceTaskRunner(mapper,service,planner,agent,json,true),second=new MealWorkspaceTaskRunner(recoveredMapper,service,planner,agent,json,true);
            for(MealWorkspaceTaskRunner runner:Arrays.asList(first,second))ReflectionTestUtils.setField(runner,"metrics",metrics);
            java.util.concurrent.atomic.AtomicInteger planning=new java.util.concurrent.atomic.AtomicInteger(),writes=new java.util.concurrent.atomic.AtomicInteger();
            when(planner.generate(anyLong(),any(),eq("select"),nullable(Long.class),nullable(List.class))).thenAnswer(call->{
                if(planning.incrementAndGet()==1){
                    assertEquals("running",mapper.taskById("claim","owned",7L).getStatus());
                    assertEquals(0,mapper.claimExpired("claim","too-early"));
                    try(Statement age=session.getConnection().createStatement()){age.execute("UPDATE workspace_task SET updated_at=DATE_SUB(NOW(),INTERVAL 31 SECOND) WHERE id='claim'");}
                    second.execute(stale); // Actual classifier + actual claim SQL, still a queued DTO.
                }
                PlanDraft draft=new PlanDraft();draft.setSource("rules");return draft;
            });
            when(service.finish(any(),any(),any(),anyString(),eq("draft"))).thenAnswer(call->{
                WorkspaceTask current=call.getArgument(0);
                int changed=mapper.finish(current.getId(),current.getLeaseToken(),"draft","{}");
                current.setStatus(changed==1?"draft":"discarded");writes.addAndGet(changed);return new MealWorkspace();
            });
            try{first.execute(initial);}finally{first.close();second.close();}
            assertEquals(2,planning.get());assertEquals(1,writes.get());
            assertEquals("discarded",initial.getStatus());assertEquals("draft",stale.getStatus());
            assertNotEquals(initial.getLeaseToken(),stale.getLeaseToken());
            WorkspaceTask persisted=mapper.taskById("claim","owned",7L);
            assertEquals("draft",persisted.getStatus());assertEquals(stale.getLeaseToken(),persisted.getLeaseToken());
            assertEquals(0,mapper.finish("claim",initial.getLeaseToken(),"draft","{}"),"Old runner's completion is fenced by real SQL");
            assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","assistant_queue").timer().count(),"Recovered queued DTO must not emit a second initial queue sample");
            assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","task_execution").tag("outcome","recover").timer().count());
            assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","task_execution").tag("outcome","cancel").timer().count());
            verifyNoInteractions(agent);
            assertEquals(0,mapper.claimExpired("claim","terminal"));assertEquals(0,mapper.claimQueued("claim","terminal"));
        }
    }
    @Test void cancellationDoesNotLockOtherWorkspacesAfterCompletedHistoryGrows()throws Exception{
        try(Connection setup=ds.getConnection();Statement sql=setup.createStatement()){
            sql.execute("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json) VALUES('000-foreign','foreign-workspace',8,'queued','{}'),('001-same-owner','other-workspace',7,'queued','{}'),('zzz-owned','owned-workspace',7,'queued','{}')");
            try(PreparedStatement history=setup.prepareStatement("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json) VALUES(?,'owned-workspace',7,'completed','{}')")){
                for(int n=0;n<500;n++){history.setString(1,"history-"+n);history.addBatch();}history.executeBatch();
            }
            sql.execute("ANALYZE TABLE workspace_task");
        }
        try(Connection blocker=ds.getConnection()){
            blocker.setAutoCommit(false);
            try(Statement hold=blocker.createStatement()){hold.executeQuery("SELECT id FROM workspace_task WHERE id IN ('000-foreign','001-same-owner') FOR UPDATE").close();}
            try(SqlSession own=factory.openSession()){
                try(Statement deadline=own.getConnection().createStatement()){deadline.execute("SET innodb_lock_wait_timeout=1");}
                Map<String,Object> args=new HashMap<>();args.put("id","owned-workspace");args.put("user",7L);args.put("task","zzz-owned");
                assertEquals(1,own.update(MealWorkspaceMapper.class.getName()+".cancel",args));own.commit();
            }finally{blocker.rollback();}
        }
        try(Connection check=ds.getConnection();Statement sql=check.createStatement();ResultSet rows=sql.executeQuery("SELECT id,status FROM workspace_task WHERE id IN ('000-foreign','001-same-owner','zzz-owned') ORDER BY id")){
            assertTrue(rows.next());assertEquals("queued",rows.getString(2));assertTrue(rows.next());assertEquals("queued",rows.getString(2));assertTrue(rows.next());assertEquals("cancelled",rows.getString(2));
        }
    }
    @Test void simultaneousFirstTaskInsertsForDifferentUsersDoNotDeadlockOnEmptyOwnerRanges()throws Exception{
        CyclicBarrier cancelled=new CyclicBarrier(2);ExecutorService pool=Executors.newFixedThreadPool(2);
        List<Future<Boolean>> futures=new ArrayList<>();
        try{
            for(long user:Arrays.asList(7L,8L))futures.add(pool.submit(()->{
                try(SqlSession session=factory.openSession()){
                    try(Statement timeout=session.getConnection().createStatement()){timeout.execute("SET innodb_lock_wait_timeout=3");}
                    Map<String,Object> args=new HashMap<>();args.put("id","first-"+user);args.put("user",user);args.put("task",null);
                    assertEquals(0,session.update(MealWorkspaceMapper.class.getName()+".cancel",args));
                    cancelled.await(5,TimeUnit.SECONDS);
                    try(PreparedStatement insert=session.getConnection().prepareStatement("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json) VALUES(?,?,?,'queued','{}')")){
                        insert.setString(1,"task-"+user);insert.setString(2,"first-"+user);insert.setLong(3,user);assertEquals(1,insert.executeUpdate());
                    }
                    session.commit();return true;
                }
            }));
            for(Future<Boolean> future:futures)assertTrue(future.get(10,TimeUnit.SECONDS));
        }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(10,TimeUnit.SECONDS));}
        try(Connection connection=ds.getConnection();Statement query=connection.createStatement();ResultSet rows=query.executeQuery("SELECT COUNT(*) FROM workspace_task WHERE status='queued'")){
            assertTrue(rows.next());assertEquals(2,rows.getInt(1));
        }
    }
}
