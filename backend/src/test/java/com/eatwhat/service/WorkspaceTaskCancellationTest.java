package com.eatwhat.service;

import com.eatwhat.entity.WorkspaceTask;
import com.eatwhat.mapper.MealWorkspaceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DeadlockLoserDataAccessException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkspaceTaskCancellationTest {
    @Test void cancellationUsesOwnerAndWorkspacePrefixInsteadOfScanningEveryQueuedTask(){
        Configuration config=new Configuration();config.addMapper(MealWorkspaceMapper.class);
        Map<String,Object> args=new HashMap<>();args.put("id","owned-workspace");args.put("user",7L);
        org.apache.ibatis.mapping.BoundSql bound=config.getMappedStatement(MealWorkspaceMapper.class.getName()+".cancel").getBoundSql(args);
        String sql=bound.getSql().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
        assertTrue(sql.contains("where user_id=? and workspace_id=?"),"Use existing ix_task_owner(user_id,workspace_id); status-only scans lock unrelated tasks");
        assertEquals("user",bound.getParameterMappings().get(0).getProperty());
    }
    @Test void transientClaimFailureLeavesOriginalQueuedTaskForNextPollWithoutCallingModel(){
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);MealWorkspaceService service=mock(MealWorkspaceService.class);
        MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);MealWorkspaceAgentGateway gateway=mock(MealWorkspaceAgentGateway.class);
        WorkspaceTask task=new WorkspaceTask();task.setId("same-original-task");task.setUserId(7L);task.setWorkspaceId("owned-workspace");
        when(db.claim(eq(task.getId()),anyString())).thenThrow(new DeadlockLoserDataAccessException("synthetic row lock",null));
        MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(db,service,planner,gateway,new ObjectMapper(),true);
        try{assertDoesNotThrow(()->runner.execute(task));verifyNoInteractions(service,planner,gateway);verify(db,never()).finish(any(),any(),any(),any());}
        finally{runner.close();}
    }
}
