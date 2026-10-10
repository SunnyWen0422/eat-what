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

/** Static snapshots and transaction/mapper boundaries only: no planner generation,
 * model gateway, Spring context, network, or live database is initialized. */
class WorkspaceTargetSaveTest {
    static class Fixture {
        final ObjectMapper json=new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);
        final MealWorkspaceMapper db=mock(MealWorkspaceMapper.class);
        final MealConsumptionMapper actual=mock(MealConsumptionMapper.class);
        final RecipeRecordMapper plans=mock(RecipeRecordMapper.class);
        final DishQueryService dishes=mock(DishQueryService.class);
        final MealWorkspacePlanner validator=mock(MealWorkspacePlanner.class);
        final Map<String,RecipeRecord> slots=new HashMap<>();
        final Map<String,Map<String,Object>> receipts=new HashMap<>();
        final List<Dish> reviewed=new ArrayList<>();
        String sourceJson; int commits,rollbacks; boolean failSourceSave;
        final MealWorkspaceService service;
        Fixture() throws Exception {
            Dish a=new Dish();a.setId(7L);a.setName("菜单A");a.setType("veg");a.setCl("青菜");reviewed.add(a);
            MealContext context=new MealContext();context.setDate("2026-12-31");context.setMealType("dinner");context.setCompositionMode("manual");context.setCounts(Collections.singletonMap("veg",1));MealWorkspaceRules.normalize(context);
            MealWorkspace source=new MealWorkspace();source.setId("source");source.setRevision(4L);source.setContext(context);source.setStatus("draft");
            source.getDraft().setPlanVersion(3L);source.getDraft().setDishes(reviewed);source.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(context));sourceJson=json.writeValueAsString(source);
            when(actual.lockUser(1L)).thenReturn(1L);when(plans.lockUser(1L)).thenReturn(1L);
            when(db.find(anyString(),anyLong())).thenAnswer(i->{if(!"source".equals(i.getArgument(0)) || !Long.valueOf(1L).equals(i.getArgument(1)))return null;WorkspaceRow r=new WorkspaceRow();r.setStateJson(sourceJson);return r;});
            when(plans.findSlot(anyLong(),anyString(),anyString())).thenAnswer(i->slots.get(i.getArgument(1)+"|"+i.getArgument(2)));
            when(dishes.getDishesByIdsForUser(anyList(),eq(1L))).thenAnswer(i->new ArrayList<>(reviewed));
            when(plans.insert(any())).thenAnswer(i->{RecipeRecord r=i.getArgument(0);RecipeRecord copy=json.convertValue(r,RecipeRecord.class);copy.setRevision(r.getExpectedRevision()+1);slots.put(r.getRecordDateString()+"|"+r.getMealType(),copy);return 1;});
            when(db.save(anyString(),eq(1L),anyLong(),anyLong(),anyString())).thenAnswer(i->{if(failSourceSave)return 0;sourceJson=i.getArgument(4);return 1;});
            when(db.request(anyLong(),anyString())).thenAnswer(i->receipts.get(i.getArgument(1)));
            when(db.log(anyLong(),anyString(),anyString(),anyString())).thenAnswer(i->{Map<String,Object> receipt=new HashMap<>();receipt.put("requestHash",i.getArgument(2));receipt.put("responseJson",i.getArgument(3));receipts.put(i.getArgument(1),receipt);return 1;});
            TransactionTemplate tx=new TransactionTemplate(new AbstractPlatformTransactionManager() {
                Map<String,RecipeRecord> beforeSlots;Map<String,Map<String,Object>> beforeReceipts;String beforeSource;
                protected Object doGetTransaction(){return new Object();}
                protected void doBegin(Object t,TransactionDefinition d){beforeSlots=new HashMap<>(slots);beforeReceipts=new HashMap<>(receipts);beforeSource=sourceJson;}
                protected void doCommit(DefaultTransactionStatus s){commits++;}
                protected void doRollback(DefaultTransactionStatus s){slots.clear();slots.putAll(beforeSlots);receipts.clear();receipts.putAll(beforeReceipts);sourceJson=beforeSource;rollbacks++;}
            });
            service=new MealWorkspaceService(db,actual,plans,new RecipeRecordService(plans,dishes),validator,json,tx);
        }
        WorkspaceRequest request(String targetDate,String targetMeal) throws Exception {
            // Unknown optional fields are ignored on the RED baseline: the behavioral
            // assertions below then expose the wrong source-slot write.
            return json.readValue("{\"requestId\":\"save-one\",\"expectedWorkspaceRevision\":4,\"planVersion\":3,\"expectedPlanRevision\":0"+
                (targetDate==null?"":",\"targetDate\":\""+targetDate+"\"")+(targetMeal==null?"":",\"targetMealType\":\""+targetMeal+"\"")+"}",WorkspaceRequest.class);
        }
        MealWorkspace save(WorkspaceRequest request){return service.mutate(1L,"source","confirm",request);}
    }
    @Test void savesFrozenSourceToAnotherYearWithoutReadingOrChangingTargetWorkspace() throws Exception {
        Fixture f=new Fixture();MealWorkspace saved=f.save(f.request("2027-01-01","lunch"));
        RecipeRecord plan=f.slots.get("2027-01-01|lunch");assertNotNull(plan,"the explicit target receives the source snapshot");
        assertEquals(Collections.singletonList(7L),plan.getDishIds());assertEquals("菜单A",plan.getDishDetails().get(0).getName());assertEquals(2,plan.getTargetPeople());
        assertFalse(f.slots.containsKey("2026-12-31|dinner"));assertEquals("2026-12-31",saved.getContext().getDate());assertEquals("dinner",saved.getContext().getMealType());
        assertEquals("2027-01-01",saved.getConfirmation().get("date"));assertEquals("lunch",saved.getConfirmation().get("mealType"));assertEquals(3L,saved.getConfirmation().get("planVersion"));
        verify(f.db,never()).slot(anyLong(),anyString(),anyString());verify(f.actual,never()).find(anyLong(),anyString(),anyString());
        verify(f.validator).lockAndValidate(eq(1L),any(MealWorkspace.class),eq(Collections.singletonList(7L)));verify(f.validator,never()).generate(anyLong(),any(),anyString(),any(),anyList());assertEquals(1,f.commits);
    }
    @Test void targetRevisionIsCheckedIncludingDeletedSlotsBeforeAnyWrite() throws Exception {
        Fixture f=new Fixture();RecipeRecord existing=new RecipeRecord();existing.setRevision(6L);existing.setIsDeleted(true);f.slots.put("2027-01-01|lunch",existing);
        WorkspaceRequest request=f.request("2027-01-01","lunch");assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(request));
        verify(f.plans,never()).insert(any());verify(f.validator,never()).lockAndValidate(anyLong(),any(),anyList());
        request.setExpectedPlanRevision(6L);MealWorkspace saved=f.save(request);assertEquals(7L,saved.getConfirmation().get("planRevision"));
    }
    @Test void replayUsesOriginalRequestAndDifferentTargetCannotReuseTheIdentifier() throws Exception {
        Fixture f=new Fixture();WorkspaceRequest request=f.request("2027-01-01","lunch");MealWorkspace saved=f.save(request);
        assertEquals(f.json.writeValueAsString(saved.getConfirmation()),f.json.writeValueAsString(f.save(request).getConfirmation()));verify(f.plans,times(1)).insert(any());
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(f.request("2027-01-02","lunch")));
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(f.request("2027-01-01","dinner")));
        verify(f.plans,times(1)).insert(any());
    }
    @Test void invalidDateAndMealCannotWriteOrMutateTheSource() throws Exception {
        for(String[] bad:new String[][]{{"2026-02-30","lunch"},{"2027-1-01","lunch"},{"2027-01-01","snack"},{"2027-01-01",null},{null,"lunch"}}) {
            Fixture f=new Fixture();String before=f.sourceJson;WorkspaceRequest request=f.request(bad[0],bad[1]);
            assertThrows(IllegalArgumentException.class,()->f.save(request));assertEquals(before,f.sourceJson);verify(f.plans,never()).insert(any());
        }
    }
    @Test void staleSourceRevisionPlanVersionAndWrongOwnerCannotSave() throws Exception {
        Fixture f=new Fixture();WorkspaceRequest r=f.request("2027-01-01","lunch");r.setExpectedWorkspaceRevision(3L);
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(r));r.setExpectedWorkspaceRevision(4L);r.setPlanVersion(2L);
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(r));when(f.actual.lockUser(2L)).thenReturn(2L);
        assertThrows(IllegalArgumentException.class,()->f.service.mutate(2L,"source","confirm",r));verify(f.plans,never()).insert(any());
    }
    @Test void unavailableDishPermissionAndHardRestrictionStillRejectAtWriteBoundary() throws Exception {
        for(RuntimeException rejection:Arrays.asList(new MealConsumptionService.VersionConflict("菜已删除"),new MealConsumptionService.VersionConflict("权限已失效"),new IllegalArgumentException("长期忌口"))) {
            Fixture f=new Fixture();String before=f.sourceJson;when(f.validator.lockAndValidate(eq(1L),any(),anyList())).thenThrow(rejection);
            assertSame(rejection,assertThrows(RuntimeException.class,()->f.save(f.request("2027-01-01","lunch"))));assertTrue(f.slots.isEmpty());assertEquals(before,f.sourceJson);verify(f.plans,never()).insert(any());assertEquals(1,f.rollbacks);
        }
    }
    @Test void changedRecipeSnapshotIsRejectedWithoutSavingItsNewIngredients() throws Exception {
        Fixture f=new Fixture();Dish changed=new Dish();changed.setId(7L);changed.setName("菜单A");changed.setType("veg");changed.setCl("花生");
        when(f.dishes.getDishesByIdsForUser(anyList(),eq(1L))).thenReturn(Collections.singletonList(changed));
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(f.request("2027-01-01","lunch")));verify(f.plans,never()).insert(any());assertTrue(f.slots.isEmpty());
    }
    @Test void failedSourceSaveRollsBackTheTargetInsertAndRequestReceipt() throws Exception {
        Fixture f=new Fixture();String before=f.sourceJson;f.failSourceSave=true;
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(f.request("2027-01-01","lunch")));
        verify(f.plans).insert(any());assertTrue(f.slots.isEmpty());assertTrue(f.receipts.isEmpty());assertEquals(before,f.sourceJson);assertEquals(1,f.rollbacks);assertEquals(0,f.commits);
    }
    @Test void legacyMissingTargetUsesSourceAndKeepsHistoricalRequestHashReplayable() throws Exception {
        Fixture f=new Fixture();WorkspaceRequest request=f.request(null,null);MealWorkspace saved=f.save(request);
        assertNotNull(f.slots.get("2026-12-31|dinner"));assertEquals("2026-12-31",saved.getConfirmation().get("date"));
        JsonNode old=f.json.readTree(f.json.writeValueAsString(request));((com.fasterxml.jackson.databind.node.ObjectNode)old).remove(Arrays.asList("targetDate","targetMealType"));
        String oldHash=WorkflowRequestHash.sha256("confirm|source|"+f.json.writeValueAsString(old));f.receipts.get(request.getRequestId()).put("requestHash",oldHash);
        assertEquals(f.json.writeValueAsString(saved.getConfirmation()),f.json.writeValueAsString(f.save(request).getConfirmation()));verify(f.plans,times(1)).insert(any());
    }
}
