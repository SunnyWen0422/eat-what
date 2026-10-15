package com.eatwhat.service;

import com.eatwhat.mapper.MealWorkspaceMapper;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.*;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** A foreign task is deliberately locked in a different connection. Cancellation
 * of this owner's workspace must complete without waiting on the foreign task. */
@EnabledIfEnvironmentVariable(named="EATWHAT_TASK_CANCEL_TEST",matches="1")
class WorkspaceTaskCancellationMysqlIT {
    @Test void cancellationDoesNotLockOtherWorkspacesAfterCompletedHistoryGrows()throws Exception{
        String url=System.getenv("EATWHAT_TASK_CANCEL_JDBC");
        assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_task_test_[a-f0-9]{10}\\?.*"));
        UnpooledDataSource ds=new UnpooledDataSource("com.mysql.cj.jdbc.Driver",url,"root",System.getenv("EATWHAT_TASK_CANCEL_PASSWORD"));
        try(Connection setup=ds.getConnection();Statement sql=setup.createStatement()){
            sql.execute("CREATE TABLE workspace_task(id VARCHAR(36) PRIMARY KEY,workspace_id VARCHAR(36) NOT NULL,user_id BIGINT NOT NULL,status VARCHAR(32) NOT NULL,input_json JSON NOT NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY ix_task_poll(status,updated_at),KEY ix_task_owner(user_id,workspace_id)) ENGINE=InnoDB");
            sql.execute("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json) VALUES('000-foreign','foreign-workspace',8,'queued','{}'),('001-same-owner','other-workspace',7,'queued','{}'),('zzz-owned','owned-workspace',7,'queued','{}')");
            try(PreparedStatement history=setup.prepareStatement("INSERT INTO workspace_task(id,workspace_id,user_id,status,input_json) VALUES(?,'owned-workspace',7,'completed','{}')")){
                for(int n=0;n<500;n++){history.setString(1,"history-"+n);history.addBatch();}history.executeBatch();
            }
            sql.execute("ANALYZE TABLE workspace_task");
        }
        Configuration config=new Configuration(new Environment("owned-task-cancel",new JdbcTransactionFactory(),ds));config.addMapper(MealWorkspaceMapper.class);
        SqlSessionFactory factory=new SqlSessionFactoryBuilder().build(config);
        try(Connection blocker=ds.getConnection()){
            blocker.setAutoCommit(false);
            try(Statement hold=blocker.createStatement()){hold.executeQuery("SELECT id FROM workspace_task WHERE id IN ('000-foreign','001-same-owner') FOR UPDATE").close();}
            try(SqlSession own=factory.openSession()){
                try(Statement deadline=own.getConnection().createStatement()){deadline.execute("SET innodb_lock_wait_timeout=1");}
                Map<String,Object> args=new HashMap<>();args.put("id","owned-workspace");args.put("user",7L);
                assertEquals(1,own.update(MealWorkspaceMapper.class.getName()+".cancel",args));own.commit();
            }finally{blocker.rollback();}
        }
        try(Connection check=ds.getConnection();Statement sql=check.createStatement();ResultSet rows=sql.executeQuery("SELECT id,status FROM workspace_task WHERE id IN ('000-foreign','001-same-owner','zzz-owned') ORDER BY id")){
            assertTrue(rows.next());assertEquals("queued",rows.getString(2));assertTrue(rows.next());assertEquals("queued",rows.getString(2));assertTrue(rows.next());assertEquals("cancelled",rows.getString(2));
        }
    }
}
