package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.*;
import org.springframework.transaction.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MealWorkspaceServiceTest {
    private static TransactionTemplate transactions() {
        return new TransactionTemplate(new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction(){return new Object();}
            protected void doBegin(Object t,TransactionDefinition d){}
            protected void doCommit(DefaultTransactionStatus s){}
            protected void doRollback(DefaultTransactionStatus s){}
        });
    }
    @Test void replayPrecedesRevisionCheckAndDifferentPayloadIsRejected() throws Exception {
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);
        MealConsumptionMapper locks=mock(MealConsumptionMapper.class);
        when(locks.lockUser(1L)).thenReturn(1L);
        when(db.save(anyString(),anyLong(),anyLong(),anyLong(),anyString())).thenReturn(1);
        Map<String,Map<String,Object>> receipts=new HashMap<>();
        when(db.request(anyLong(),anyString())).thenAnswer(i->receipts.get(i.getArgument(1)));
        doAnswer(i->{Map<String,Object> r=new HashMap<>();r.put("requestHash",i.getArgument(2));r.put("responseJson",i.getArgument(3));receipts.put(i.getArgument(1),r);return 1;}).when(db).log(anyLong(),anyString(),anyString(),anyString());
        MealWorkspace w=new MealWorkspace();w.setId("ws1");MealContext c=new MealContext();c.setDate("2026-10-03");w.setContext(c);
        ObjectMapper json=new ObjectMapper();
        when(db.find("ws1",1L)).thenAnswer(i->{WorkspaceRow row=new WorkspaceRow();row.setStateJson(json.writeValueAsString(w));return row;});
        MealWorkspaceService s=new MealWorkspaceService(db,locks,mock(RecipeRecordMapper.class),mock(RecipeRecordService.class),mock(MealWorkspacePlanner.class),json,transactions());
        WorkspaceRequest req=new WorkspaceRequest();req.setRequestId("ctx-one");req.setExpectedWorkspaceRevision(0L);req.setContext(c);
        MealWorkspace saved=s.mutate(1L,"ws1","context",req);w.setRevision(9L);
        assertEquals(saved.getRevision(),s.mutate(1L,"ws1","context",req).getRevision());
        req.getContext().setPeople(3);
        assertThrows(MealConsumptionService.VersionConflict.class,()->s.mutate(1L,"ws1","context",req));
    }
    @Test void changingCriteriaInvalidatesEvenUnchangedTextUnderstanding() throws Exception {
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);
        when(db.request(anyLong(),anyString())).thenReturn(null);
        MealConsumptionMapper locks=mock(MealConsumptionMapper.class);
        when(locks.lockUser(1L)).thenReturn(1L);
        when(db.save(anyString(),anyLong(),anyLong(),anyLong(),anyString())).thenReturn(1);
        ObjectMapper json=new ObjectMapper();
        MealContext c=new MealContext();c.setDate("2026-10-03");c.setRequirements("temporary restriction");
        c.getCriteria().setExcludedIngredients(Collections.singletonList("egg"));
        MealWorkspace w=new MealWorkspace();w.setId("criteria-ws");w.setContext(c);
        Dish dish=new Dish();dish.setId(1L);w.getDraft().setDishes(Collections.singletonList(dish));
        w.getDraft().setRequirementsFingerprint("already-interpreted");
        WorkspaceRow row=new WorkspaceRow();row.setStateJson(json.writeValueAsString(w));when(db.find(w.getId(),1L)).thenReturn(row);
        MealContext changed=json.convertValue(c,MealContext.class);changed.getCriteria().setExcludedIngredients(Collections.emptyList());
        WorkspaceRequest request=new WorkspaceRequest();request.setRequestId("criteria-change");request.setExpectedWorkspaceRevision(0L);request.setContext(changed);
        MealWorkspaceService service=new MealWorkspaceService(db,locks,mock(RecipeRecordMapper.class),mock(RecipeRecordService.class),mock(MealWorkspacePlanner.class),json,transactions());
        MealWorkspace saved=service.mutate(1L,w.getId(),"context",request);
        assertEquals(c.getRequirements(),saved.getContext().getRequirements());
        assertNull(saved.getDraft().getRequirementsFingerprint());
        assertFalse(MealWorkspaceRules.understandsRequirements(saved.getDraft(),saved.getContext()));
        assertEquals("needs_regeneration",saved.getStatus());
    }
    @Test void wrongOwnerAndStaleVersionCannotChangeWorkspace() {
        MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);MealConsumptionMapper locks=mock(MealConsumptionMapper.class);
        when(locks.lockUser(2L)).thenReturn(2L);when(db.request(anyLong(),anyString())).thenReturn(null);
        MealWorkspaceService s=new MealWorkspaceService(db,locks,mock(RecipeRecordMapper.class),mock(RecipeRecordService.class),mock(MealWorkspacePlanner.class),new ObjectMapper(),transactions());
        WorkspaceRequest r=new WorkspaceRequest();r.setRequestId("cmd-one");r.setExpectedWorkspaceRevision(0L);
        assertThrows(IllegalArgumentException.class,()->s.mutate(2L,"ws1","context",r));
    }
}
