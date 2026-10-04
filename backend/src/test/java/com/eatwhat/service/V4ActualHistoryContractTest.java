package com.eatwhat.service;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class V4ActualHistoryContractTest {
    private static class Fixture {
        final ObjectMapper json=new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);
        final MealConsumptionMapper mapper=mock(MealConsumptionMapper.class);
        final RecipeRecordMapper plans=mock(RecipeRecordMapper.class);
        final DishQueryService catalog=mock(DishQueryService.class);
        final Map<String,Map<String,Object>> receipts=new HashMap<>();
        final MealConsumptionService service=new MealConsumptionService(mapper,plans,catalog,json,new DietReviewCalculator(json));
        MealConsumption current;
        Fixture() {
            when(mapper.lockUser(3L)).thenReturn(3L); when(mapper.find(3L,"2026-01-01","dinner")).thenAnswer(i->current);
            when(mapper.request(eq(3L),anyString())).thenAnswer(i->receipts.get(i.getArgument(1)));
            when(mapper.save(any())).thenAnswer(i->{current=i.getArgument(0); current.setId(88L); return 1;});
            when(mapper.log(eq(3L),anyString(),anyString(),anyString())).thenAnswer(i->{Map<String,Object> receipt=new HashMap<>();receipt.put("requestHash",i.getArgument(2));receipt.put("responseJson",i.getArgument(3));receipts.put(i.getArgument(1),receipt);return 1;});
            when(plans.selectByUserAndDate(3L,"2026-01-01")).thenReturn(Collections.emptyList());
        }
        void history() {
            current=new MealConsumption(); current.setId(88L); current.setUserId(3L); current.setRevision(2L); current.setStatus("eaten"); current.setMealDate("2026-01-01"); current.setMealType("dinner"); current.setSourceRecordId(40L);
            current.setActualDishesJson("[{\"dishId\":\"9\",\"name\":\"旧名鱼\",\"type\":\"meat\"},{\"dishId\":\"10\",\"name\":\"旧名菜\",\"type\":\"veg\"},{\"name\":\"外卖面条\"}]");
            current.setPlannedSnapshotJson("{\"name\":\"原始安排\",\"dishIds\":[9,10],\"revision\":1,\"targetPeople\":6,\"recordOrigin\":\"manual\",\"confirmedAsPlanned\":true}");
        }
        MealConsumptionRequest request(String key,long revision,String entries) throws Exception {
            return json.readValue("{\"requestId\":\""+key+"\",\"expectedRevision\":"+revision+",\"status\":\"eaten\",\"usePlan\":false,\"dishes\":"+entries+"}",MealConsumptionRequest.class);
        }
        MealConsumption save(MealConsumptionRequest r) { return service.save(3L,"2026-01-01","dinner",r); }
        RecipeRecord plan(int people) {
            RecipeRecord p=new RecipeRecord(); p.setId(50L); p.setMealType("dinner"); p.setRecipeName("后来安排"); p.setTargetPeople(people); p.setRevision(8L); p.setDishIds(Collections.singletonList(12L)); p.setRecordOrigin("manual");
            Dish d=new Dish(); d.setId(12L); d.setName("当前可信汤"); d.setType("soup"); p.setDishDetails(Collections.singletonList(d));
            when(plans.selectByUserAndDate(3L,"2026-01-01")).thenReturn(Collections.singletonList(p)); return p;
        }
    }
    @Test void retainedDeletedRenamedAndFreeEntriesKeepOwnedHistoricalNamesAndTypes() throws Exception {
        Fixture f=new Fixture(); f.history(); f.plan(2);
        Dish renamed=new Dish(); renamed.setId(10L); renamed.setName("新菜名"); renamed.setType("dessert"); when(f.catalog.getDishById(10L,3L)).thenReturn(renamed);
        MealConsumptionRequest request=f.request("retain-all",2,"[{\"retainedEntryIndex\":0},{\"retainedEntryIndex\":1},{\"retainedEntryIndex\":2}]");
        MealConsumption result=assertDoesNotThrow(()->f.save(request));
        assertEquals("旧名鱼",result.getActualDishes().get(0).get("name")); assertEquals("旧名菜",result.getActualDishes().get(1).get("name")); assertEquals("veg",result.getActualDishes().get(1).get("type")); assertEquals("外卖面条",result.getActualDishes().get(2).get("name"));
        assertEquals(40L,result.getSourceRecordId()); assertEquals("原始安排",result.getPlannedSnapshot().get("name")); assertEquals(6,result.getPlannedSnapshot().get("targetPeople")); assertEquals(1,result.getPlannedSnapshot().get("revision"));
        verifyNoInteractions(f.catalog);
    }
    @Test void retainedOriginalSnapshotSurvivesRemovedPlanWithoutInventingHistoricalPeople() throws Exception {
        Fixture f=new Fixture(); f.history(); f.current.setPlannedSnapshotJson("{\"name\":\"原始安排\",\"recordOrigin\":\"manual\",\"confirmedAsPlanned\":true}");
        MealConsumptionRequest request=f.request("no-plan",2,"[{\"retainedEntryIndex\":0},{\"name\":\"新外卖\"}]");
        MealConsumption result=assertDoesNotThrow(()->f.save(request));
        assertEquals(40L,result.getSourceRecordId()); assertEquals("原始安排",result.getPlannedSnapshot().get("name")); assertFalse(result.getPlannedSnapshot().containsKey("targetPeople"));
    }
    @Test void newSelectionsUseCatalogAndHistoricalEditsReplayBeforeCas() throws Exception {
        Fixture f=new Fixture(); f.history(); f.plan(2);
        Dish added=new Dish(); added.setId(12L); added.setName("当前可信汤"); added.setType("soup"); when(f.catalog.getDishById(12L,3L)).thenReturn(added);
        MealConsumptionRequest r=f.request("change-meal",2,"[{\"retainedEntryIndex\":0},{\"dishId\":12,\"name\":\"客户端假菜\"}]");
        MealConsumption saved=assertDoesNotThrow(()->f.save(r)); assertEquals("当前可信汤",saved.getActualDishes().get(1).get("name")); assertEquals("soup",saved.getActualDishes().get(1).get("type"));
        assertFalse((Boolean)saved.getPlannedSnapshot().get("confirmedAsPlanned")); assertEquals(6,saved.getPlannedSnapshot().get("targetPeople"));
        assertEquals(3L,f.save(r).getRevision()); assertEquals(3L,f.current.getRevision());
        MealConsumptionRequest stale=f.request("stale-history",2,"[{\"retainedEntryIndex\":0}]"); assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(stale));
        MealConsumptionRequest changed=f.request("change-meal",2,"[{\"name\":\"不同内容\"}]"); assertThrows(MealConsumptionService.VersionConflict.class,()->f.save(changed));
        Map<String,Object> review=new DietReviewCalculator(f.json).calculate(Collections.singletonList(f.current),Collections.emptyList(),java.time.LocalDate.of(2026,1,2));
        assertEquals(1,review.get("mealCount")); assertEquals(2,review.get("entryCount")); assertEquals(2,review.get("uniqueDishCount"));
        assertEquals(0,review.get("plannedMealsFollowed")); assertEquals(1,review.get("plannedMealsChanged"));
    }
    @Test void rejectsFabricatedOutOfRangeDuplicateOrMixedHistoricalClaims() throws Exception {
        for(String entries:Arrays.asList("[{\"retainedEntryIndex\":8,\"name\":\"伪造\"}]","[{\"retainedEntryIndex\":-1,\"name\":\"伪造\"}]","[{\"retainedEntryIndex\":0,\"name\":\"假菜名\"}]","[{\"retainedEntryIndex\":0,\"dishId\":12}]","[{\"retainedEntryIndex\":0},{\"retainedEntryIndex\":0}]","[{\"retainedEntryIndex\":0,\"type\":\"dessert\"}]")) {
            Fixture f=new Fixture(); f.history(); MealConsumptionRequest r=f.request("forged",2,entries);
            assertThrows(IllegalArgumentException.class,()->f.save(r),entries); assertEquals(2L,f.current.getRevision());
        }
        Fixture noHistory=new Fixture(); MealConsumptionRequest r=noHistory.request("no-history",0,"[{\"retainedEntryIndex\":0,\"name\":\"伪造\"}]"); assertThrows(IllegalArgumentException.class,()->noHistory.save(r));
    }
    @Test void explicitUsePlanCanConfirmCurrentPlanAndRecordsItsTargetPeople() throws Exception {
        Fixture f=new Fixture(); f.history(); f.plan(4);
        MealConsumptionRequest r=f.request("use-current-plan",2,"[]"); r.setUsePlan(true); r.setExpectedPlanRevision(8L);
        MealConsumption result=f.save(r); assertEquals(50L,result.getSourceRecordId()); assertEquals(4,result.getPlannedSnapshot().get("targetPeople")); assertEquals("当前可信汤",result.getActualDishes().get(0).get("name")); assertEquals(true,result.getPlannedSnapshot().get("confirmedAsPlanned"));
    }
    @Test void optionalHistoryFieldsPreservePreUpgradeReceiptHashForOriginalRetry() throws Exception {
        Fixture f=new Fixture();
        String original="{\"requestId\":\"legacy-actual\",\"expectedRevision\":0,\"expectedPlanRevision\":null,\"status\":\"eaten\",\"usePlan\":false,\"dishes\":[{\"dishId\":9,\"name\":null}]}";
        Map<String,Object> receipt=new HashMap<>();receipt.put("requestHash",com.eatwhat.util.WorkflowRequestHash.sha256("2026-01-01|dinner|"+original));receipt.put("responseJson","{\"revision\":1,\"actualDishes\":[{\"dishId\":\"9\",\"name\":\"saved before upgrade\",\"type\":\"meat\"}]}");f.receipts.put("legacy-actual",receipt);
        MealConsumptionRequest retry=f.json.readValue(original,MealConsumptionRequest.class);
        MealConsumption result=assertDoesNotThrow(()->f.save(retry));assertEquals(1L,result.getRevision());assertEquals("saved before upgrade",result.getActualDishes().get(0).get("name"));
        verifyNoInteractions(f.catalog);verify(f.mapper,never()).save(any());
    }
}
