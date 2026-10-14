package com.eatwhat.service;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MealConsumptionServiceTest {
    private static class SlotFixture {
        final MealConsumptionMapper mapper = mock(MealConsumptionMapper.class);
        final RecipeRecordMapper plans = mock(RecipeRecordMapper.class);
        final DishQueryService dishes = mock(DishQueryService.class);
        final ObjectMapper json = new ObjectMapper();
        final MealConsumptionService service = new MealConsumptionService(mapper, plans, dishes, json, new DietReviewCalculator(json));
        SlotFixture() {
            when(mapper.lockUser(1L)).thenReturn(1L);
            when(mapper.request(anyLong(), anyString())).thenReturn(null);
        }
        void slot(long revision, boolean deleted) {
            RecipeRecord plan = new RecipeRecord();
            plan.setId(8L); plan.setUserId(1L); plan.setRecordDateString("2026-01-01");
            plan.setMealType("dinner"); plan.setRecipeName("已删除的安排");
            plan.setDishIds(Collections.singletonList(9L)); plan.setRevision(revision); plan.setIsDeleted(deleted);
            when(plans.findSlot(1L, "2026-01-01", "dinner")).thenReturn(plan);
            when(plans.selectByUserAndDate(1L, "2026-01-01"))
                .thenReturn(deleted ? Collections.emptyList() : Collections.singletonList(plan));
            when(plans.slotRevisions(1L, "2026-01-01", "2026-01-01")).thenReturn(Collections.singletonList(plan));
        }
        MealConsumptionRequest manual(long planRevision) {
            MealConsumptionRequest request = new MealConsumptionRequest();
            request.setRequestId("first-manual"); request.setExpectedRevision(0L);
            request.setExpectedPlanRevision(planRevision); request.setStatus("eaten"); request.setUsePlan(false);
            MealConsumptionRequest.Entry entry = new MealConsumptionRequest.Entry(); entry.setName("外食面条");
            request.setDishes(Collections.singletonList(entry));
            return request;
        }
        MealConsumption save(MealConsumptionRequest request) { return service.save(1L, "2026-01-01", "dinner", request); }
    }
    @Test void firstManualMealAcceptsDeletedPlanRevisionFromOverviewWithoutSavingDeletedSnapshot() {
        SlotFixture f = new SlotFixture(); f.slot(2L, true);
        Map<String,Object> overview = f.service.overview(1L, "2026-01-01", "2026-01-01");
        assertTrue(((List<?>) overview.get("plans")).isEmpty());
        long revision = ((Number) ((Map<?,?>) overview.get("planRevisions")).get("2026-01-01|dinner")).longValue();
        assertEquals(2L, revision);
        MealConsumption saved = assertDoesNotThrow(() -> f.save(f.manual(revision)));
        assertEquals(1L, saved.getRevision());
        assertEquals("外食面条", saved.getActualDishes().get(0).get("name"));
        assertNull(saved.getSourceRecordId()); assertNull(saved.getPlannedSnapshot());
        verify(f.mapper).save(saved); verifyNoInteractions(f.dishes);
    }
    @Test void firstManualMealRejectsPlanChangedAfterOverview() {
        SlotFixture f = new SlotFixture(); f.slot(2L, true);
        Map<?,?> revisions = (Map<?,?>) f.service.overview(1L, "2026-01-01", "2026-01-01").get("planRevisions");
        MealConsumptionRequest request = f.manual(((Number) revisions.get("2026-01-01|dinner")).longValue());
        f.slot(3L, false);
        assertThrows(MealConsumptionService.VersionConflict.class, () -> f.save(request));
        verify(f.mapper, never()).save(any()); verify(f.mapper, never()).log(anyLong(), anyString(), anyString(), anyString());
    }
    @Test void firstManualMealWithoutPlanHistoryAcceptsZeroRevision() {
        SlotFixture f = new SlotFixture();
        MealConsumption saved = f.save(f.manual(0L));
        assertEquals(1L, saved.getRevision()); assertNull(saved.getPlannedSnapshot()); assertNull(saved.getSourceRecordId());
    }
    @Test void deletedPlanCannotBeConfirmedAsEatenEvenWithMatchingRevision() {
        SlotFixture f = new SlotFixture(); f.slot(2L, true);
        MealConsumptionRequest request = f.manual(2L); request.setUsePlan(true);
        assertThrows(IllegalArgumentException.class, () -> f.save(request));
        verify(f.mapper, never()).save(any()); verifyNoInteractions(f.dishes);
    }
    @Test void eatingAsPlannedUsesSavedSnapshotAfterCatalogChanges() {
        MealConsumptionMapper mapper=mock(MealConsumptionMapper.class);RecipeRecordMapper plans=mock(RecipeRecordMapper.class);DishQueryService dishes=mock(DishQueryService.class);
        when(mapper.lockUser(1L)).thenReturn(1L);when(mapper.request(anyLong(),anyString())).thenReturn(null);
        Dish original=new Dish();original.setId(9L);original.setName("清蒸鱼");original.setType("meat");
        Dish changed=new Dish();changed.setId(9L);changed.setName("后来改成的菜");changed.setType("veg");when(dishes.getDishById(9L,1L)).thenReturn(changed);
        RecipeRecord plan=new RecipeRecord();plan.setId(8L);plan.setMealType("dinner");plan.setRecipeName("清蒸鱼");plan.setDishIds(Collections.singletonList(9L));plan.setDishDetails(Collections.singletonList(original));plan.setRecordOrigin("manual");plan.setRevision(1L);
        when(plans.findSlot(1L,"2026-01-01","dinner")).thenReturn(plan);
        ObjectMapper json=new ObjectMapper();MealConsumptionService service=new MealConsumptionService(mapper,plans,dishes,json,new DietReviewCalculator(json));
        MealConsumptionRequest request=new MealConsumptionRequest();request.setRequestId("snapshot-eaten");request.setExpectedRevision(0L);request.setExpectedPlanRevision(1L);request.setStatus("eaten");request.setUsePlan(true);
        MealConsumption saved=service.save(1L,"2026-01-01","dinner",request);
        assertEquals("清蒸鱼",saved.getActualDishes().get(0).get("name"));assertEquals("meat",saved.getActualDishes().get(0).get("type"));
        verifyNoInteractions(dishes);
    }
    @Test void capturesActualFoodSeparatelyFromPlanAndRejectsStaleEdit() {
        MealConsumptionMapper mapper=mock(MealConsumptionMapper.class);
        RecipeRecordMapper plans=mock(RecipeRecordMapper.class);
        DishQueryService dishes=mock(DishQueryService.class);
        when(mapper.lockUser(1L)).thenReturn(1L);
        when(mapper.request(anyLong(),anyString())).thenReturn(null);
        RecipeRecord plan=new RecipeRecord();plan.setId(8L);plan.setMealType("dinner");plan.setRecipeName("清蒸鱼");plan.setDishIds(Arrays.asList(9L));plan.setRevision(1L);
        when(plans.findSlot(1L,"2026-01-01","dinner")).thenReturn(plan);
        ObjectMapper json=new ObjectMapper();
        MealConsumptionService service=new MealConsumptionService(mapper,plans,dishes,json,new DietReviewCalculator(json));
        MealConsumptionRequest request=new MealConsumptionRequest();request.setRequestId("meal-one");request.setExpectedRevision(0L);request.setStatus("eaten");
        MealConsumptionRequest.Entry entry=new MealConsumptionRequest.Entry();entry.setName("面条");request.setDishes(Arrays.asList(entry));
        MealConsumption result=service.save(1L,"2026-01-01","dinner",request);
        assertEquals("面条",result.getActualDishes().get(0).get("name"));
        assertEquals("清蒸鱼",result.getPlannedSnapshot().get("name"));
        assertEquals(1L,result.getRevision());
        when(mapper.find(1L,"2026-01-01","dinner")).thenReturn(result);
        request.setRequestId("meal-two");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.save(1L,"2026-01-01","dinner",request));
    }
    @Test void doesNotTrustForeignDishNames() {
        MealConsumptionMapper mapper=mock(MealConsumptionMapper.class);RecipeRecordMapper plans=mock(RecipeRecordMapper.class);DishQueryService dishes=mock(DishQueryService.class);
        when(mapper.lockUser(1L)).thenReturn(1L);when(mapper.request(anyLong(),anyString())).thenReturn(null);when(plans.selectByUserAndDate(anyLong(),anyString())).thenReturn(Collections.emptyList());
        ObjectMapper json=new ObjectMapper();MealConsumptionService service=new MealConsumptionService(mapper,plans,dishes,json,new DietReviewCalculator(json));
        MealConsumptionRequest request=new MealConsumptionRequest();request.setRequestId("foreign");request.setExpectedRevision(0L);request.setStatus("eaten");
        MealConsumptionRequest.Entry entry=new MealConsumptionRequest.Entry();entry.setDishId(99L);entry.setName("假名字");request.setDishes(Arrays.asList(entry));
        assertThrows(IllegalArgumentException.class,()->service.save(1L,"2026-01-01","dinner",request));
    }
}
