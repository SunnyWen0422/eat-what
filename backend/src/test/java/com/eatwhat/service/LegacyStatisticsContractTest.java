package com.eatwhat.service;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.RecipeRecordMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LegacyStatisticsContractTest {
    @Test void legacyEndpointStillCountsPlansButDisclaimsActualIntake() {
        RecipeRecordMapper mapper=mock(RecipeRecordMapper.class);
        DishQueryService dishes=mock(DishQueryService.class);
        RecipeRecord plan=new RecipeRecord();plan.setRecordDate(java.sql.Date.valueOf("2026-01-01"));plan.setDishIds(Collections.singletonList(7L));
        Dish dish=new Dish();dish.setId(7L);dish.setName("计划菜品");dish.setType("meat");
        when(mapper.selectRecordsByUserAndRange(eq(1L),anyString(),anyString())).thenReturn(Collections.singletonList(plan));
        when(dishes.getDishesByIds(anyList())).thenReturn(Collections.singletonList(dish));
        StatisticsDTO result=new RecipeRecordService(mapper,dishes).getStatistics(1L,java.sql.Date.valueOf("2026-01-01"),java.sql.Date.valueOf("2026-01-07"));
        assertEquals(1,result.getStatistics().getMeatCount()); assertEquals(1,result.getDaysWithRecords());
        assertNull(result.getStatistics().getTotalCalories());
        JsonNode data=new ObjectMapper().valueToTree(result);
        assertEquals("plan",data.path("basis").asText());assertTrue(data.path("deprecated").asBoolean());
    }
}
