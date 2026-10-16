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
    private MealWorkspaceService directService(MealWorkspaceMapper db,com.eatwhat.mapper.MealConsumptionMapper users){
        org.springframework.transaction.support.TransactionTemplate tx=new org.springframework.transaction.support.TransactionTemplate(){
            @Override public <T> T execute(org.springframework.transaction.support.TransactionCallback<T> callback){return callback.doInTransaction(new org.springframework.transaction.support.SimpleTransactionStatus());}
        };
        return new MealWorkspaceService(db,users,mock(com.eatwhat.mapper.RecipeRecordMapper.class),mock(RecipeRecordService.class),mock(MealWorkspacePlanner.class),new ObjectMapper(),tx);
    }
    private com.eatwhat.entity.WorkspaceRow stored(String task,long revision)throws Exception{
        com.eatwhat.dto.MealWorkspace value=new com.eatwhat.dto.MealWorkspace();value.setId("owned-workspace");value.setTaskId(task);value.setRevision(revision);value.setStatus("generating");
        com.eatwhat.dto.MealContext context=new com.eatwhat.dto.MealContext();context.setDate("2026-10-16");context.setMealType("dinner");value.setContext(context);
        com.eatwhat.entity.WorkspaceRow row=new com.eatwhat.entity.WorkspaceRow();row.setRevision(revision);row.setStateJson(new ObjectMapper().writeValueAsString(value));return row;
    }
    @Test void cancellationBindsThePersistedCurrentTaskInsteadOfAnOwnerRange()throws Exception{
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);com.eatwhat.mapper.MealConsumptionMapper users=mock(com.eatwhat.mapper.MealConsumptionMapper.class);
        when(users.lockUser(7L)).thenReturn(7L);when(db.request(anyLong(),anyString())).thenReturn(null);when(db.find("owned-workspace",7L)).thenReturn(stored("persisted-current-task",3));when(db.save(anyString(),eq(7L),eq(4L),eq(3L),anyString())).thenReturn(1);
        com.eatwhat.dto.WorkspaceRequest request=new com.eatwhat.dto.WorkspaceRequest();request.setRequestId(UUID.randomUUID().toString());request.setExpectedWorkspaceRevision(3L);request.setPlanVersion(0L);request.setCommand("cancel");
        com.eatwhat.dto.MealWorkspace result=directService(db,users).mutate(7L,"owned-workspace","commands",request);
        Object[] parameters=mockingDetails(db).getInvocations().stream().filter(call->call.getMethod().getName().equals("cancel")).findFirst().get().getArguments();
        assertEquals(3,parameters.length);assertArrayEquals(new Object[]{"owned-workspace",7L,"persisted-current-task"},parameters);assertNull(result.getTaskId());
    }
    @Test void supersededTaskCannotPublishOverTheCurrentTask()throws Exception{
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);com.eatwhat.mapper.MealConsumptionMapper users=mock(com.eatwhat.mapper.MealConsumptionMapper.class);
        when(users.lockUser(7L)).thenReturn(7L);when(db.find("owned-workspace",7L)).thenReturn(stored("new-current-task",4));
        WorkspaceTask old=new WorkspaceTask();old.setId("superseded-task");old.setUserId(7L);old.setWorkspaceId("owned-workspace");old.setBaseRevision(3L);old.setLeaseToken("old-lease");
        com.eatwhat.dto.MealWorkspace result=directService(db,users).finish(old,null,new com.eatwhat.dto.PlanDraft(),"must not publish","draft");
        assertEquals("new-current-task",result.getTaskId());assertEquals("generating",result.getStatus());verify(db).finish("superseded-task","old-lease","discarded","{}");verify(db,never()).save(any(),any(),any(),any(),any());
    }
    @Test void cancellationUsesExactServerTaskAndStillChecksOwnerAndWorkspace(){
        Configuration config=new Configuration();config.addMapper(MealWorkspaceMapper.class);
        Map<String,Object> args=new HashMap<>();args.put("id","owned-workspace");args.put("user",7L);args.put("task","current-server-task");
        org.apache.ibatis.mapping.BoundSql bound=config.getMappedStatement(MealWorkspaceMapper.class.getName()+".cancel").getBoundSql(args);
        String sql=bound.getSql().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
        assertTrue(sql.contains("where id=? and user_id=? and workspace_id=?"),"Only the persisted current task may be cancelled; owner and workspace checks remain mandatory");
        assertTrue(sql.contains("force index(primary)"),"An empty owner range takes a next-key gap lock and can deadlock first inserts for different accounts");
        assertEquals("task",bound.getParameterMappings().get(0).getProperty());
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
