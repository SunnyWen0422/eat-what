package com.eatwhat.service;

import com.eatwhat.entity.MealConsumption;
import com.eatwhat.entity.RecipeRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class DietReviewCalculatorTest {
    private MealConsumption meal(String date, String status, String entries) {
        MealConsumption value = new MealConsumption();
        value.setMealDate(date); value.setMealType("dinner");
        value.setStatus(status); value.setActualDishesJson(entries);
        return value;
    }
    @Test void countsOnlyExplicitConsumptionAndKeepsUnknownFoodVisible() {
        List<MealConsumption> meals = Arrays.asList(
            meal("2026-10-01", "eaten", "[{\"dishId\":1,\"name\":\"番茄炒蛋\",\"type\":\"veg\"}]"),
            meal("2026-10-02", "eaten", "[{\"dishId\":1,\"name\":\"番茄炒蛋\",\"type\":\"veg\"},{\"name\":\"外卖\"}]"),
            meal("2026-10-03", "skipped", "[]"),
            meal("2026-10-04", "unrecorded", "[]"));
        Map<String,Object> report = new DietReviewCalculator(new ObjectMapper()).calculate(meals, Collections.emptyList(), LocalDate.of(2026,10,5));
        assertEquals(2, report.get("mealCount"));
        assertEquals(2, report.get("recordedDays"));
        assertEquals(1, report.get("uniqueDishCount"));
        assertEquals(1, report.get("unclassifiedCount"));
        assertEquals(3, report.get("entryCount"));
        assertFalse(report.containsKey("calories"));
        List<?> popular = (List<?>) report.get("popularDishes");
        assertEquals(2, ((Map<?,?>) popular.get(0)).get("count"));
    }
    @Test void emptyRecordsDoNotClaimIntakeOrNutrition() {
        Map<String,Object> report = new DietReviewCalculator(new ObjectMapper()).calculate(Collections.emptyList(), Collections.emptyList(), LocalDate.now());
        assertEquals(0, report.get("mealCount"));
        assertEquals(0, report.get("recordedDays"));
    }
    @Test void executionUsesPastConfirmedPlansAndPreservesDeletedPlanSnapshots() {
        RecipeRecord legacy = new RecipeRecord();
        legacy.setRecordDate(java.sql.Date.valueOf("2026-09-30"));
        legacy.setRecordOrigin("legacy"); legacy.setMealType("dinner");
        RecipeRecord pending = new RecipeRecord();
        pending.setRecordDate(java.sql.Date.valueOf("2026-10-01"));
        pending.setRecordOrigin("manual"); pending.setMealType("lunch");
        MealConsumption past = meal("2026-10-01", "eaten", "[{\"name\":\"面\"}]");
        past.setSourceRecordId(10L);
        past.setPlannedSnapshotJson("{\"recordOrigin\":\"manual\"}");
        MealConsumption current = meal("2026-10-02", "eaten", "[{\"name\":\"面\"}]");
        current.setSourceRecordId(11L);
        current.setPlannedSnapshotJson("{\"recordOrigin\":\"manual\"}");
        Map<String,Object> report = new DietReviewCalculator(new ObjectMapper()).calculate(
            Arrays.asList(past, current), Arrays.asList(legacy, pending), LocalDate.of(2026,10,2));
        assertEquals(2, report.get("plannedMealsDue"));
        assertEquals(1, report.get("plannedMealsEaten"));
        assertEquals(0, report.get("plannedMealsFollowed"));
        assertEquals(1, report.get("plannedMealsChanged"));
        assertEquals(1, report.get("unconfirmedMeals"));
    }
}
