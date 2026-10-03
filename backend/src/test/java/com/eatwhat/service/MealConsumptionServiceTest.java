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
    @Test void eatingAsPlannedUsesSavedSnapshotAfterCatalogChanges() {
        MealConsumptionMapper mapper=mock(MealConsumptionMapper.class);RecipeRecordMapper plans=mock(RecipeRecordMapper.class);DishQueryService dishes=mock(DishQueryService.class);
        when(mapper.lockUser(1L)).thenReturn(1L);when(mapper.request(anyLong(),anyString())).thenReturn(null);
        Dish original=new Dish();original.setId(9L);original.setName("清蒸鱼");original.setType("meat");
        Dish changed=new Dish();changed.setId(9L);changed.setName("后来改成的菜");changed.setType("veg");when(dishes.getDishById(9L,1L)).thenReturn(changed);
        RecipeRecord plan=new RecipeRecord();plan.setId(8L);plan.setMealType("dinner");plan.setRecipeName("清蒸鱼");plan.setDishIds(Collections.singletonList(9L));plan.setDishDetails(Collections.singletonList(original));plan.setRecordOrigin("manual");plan.setRevision(1L);
        when(plans.selectByUserAndDate(1L,"2026-01-01")).thenReturn(Collections.singletonList(plan));
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
        when(plans.selectByUserAndDate(1L,"2026-01-01")).thenReturn(Arrays.asList(plan));
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
