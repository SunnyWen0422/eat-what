package com.eatwhat.service;

import com.eatwhat.entity.MealConsumption;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.mapper.RecipeRecordMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DietReportFoundationTest {
    private final ObjectMapper json = new ObjectMapper();
    private final MealConsumptionMapper actual = mock(MealConsumptionMapper.class);
    private final RecipeRecordMapper plans = mock(RecipeRecordMapper.class);
    private final MealConsumptionService service = new MealConsumptionService(actual, plans,
        mock(DishQueryService.class), json, new DietReviewCalculator(json));
    private final String start = "2026-01-01", end = "2026-01-07";

    private MealConsumption meal(long id, String day, String type, String status, String dishes) {
        MealConsumption value = new MealConsumption();
        value.setId(id); value.setRevision(1L); value.setMealDate(day); value.setMealType(type);
        value.setStatus(status); value.setActualDishesJson(dishes);
        return value;
    }
    private RecipeRecord plan(long id, String day, String type) {
        RecipeRecord value = new RecipeRecord();
        value.setId(id); value.setRevision(1L); value.setRecordDateString(day);
        value.setMealType(type); value.setRecordOrigin("manual"); value.setRecipeName("原计划");
        return value;
    }
    private Map<String,Object> report(long user, List<MealConsumption> meals, List<RecipeRecord> records) {
        when(actual.range(user, start, end)).thenReturn(meals);
        when(plans.selectRangeDays(user, start, end)).thenReturn(records);
        when(plans.slotRevisions(user, start, end)).thenReturn(Collections.emptyList());
        return service.review(user, start, end);
    }
    @SuppressWarnings("unchecked") private Map<String,Object> object(Map<String,Object> value, String key) {
        assertTrue(value.get(key) instanceof Map, "missing object: " + key);
        return (Map<String,Object>) value.get(key);
    }
    @Test void reportsSixActualBasedBlocksAndTraceableMetadata() {
        MealConsumption eaten = meal(4, start, "lunch", "eaten", "[{\"dishId\":7,\"name\":\"青菜\",\"type\":\"veg\"},{\"name\":\"外食\"}]");
        MealConsumption skipped = meal(5, "2026-01-02", "dinner", "skipped", "[]");
        Map<String,Object> result = report(1, Arrays.asList(eaten, skipped), Collections.singletonList(plan(9, start, "dinner")));
        Map<String,Object> metadata = object(result, "metadata");
        assertEquals("explicit_eaten", metadata.get("basis"));
        assertEquals(start, metadata.get("startDate")); assertEquals(end, metadata.get("endDate"));
        assertEquals("Asia/Shanghai", metadata.get("timezone")); assertEquals(false, metadata.get("persisted"));
        assertEquals("actual-diet-v1", metadata.get("calculationVersion"));
        assertTrue(String.valueOf(metadata.get("sourceFingerprint")).matches("[a-f0-9]{64}"));
        assertTrue(String.valueOf(metadata.get("reportId")).startsWith("diet-report-"));
        OffsetDateTime generated = OffsetDateTime.parse((String)metadata.get("generatedAt"));
        assertEquals(generated.atZoneSameInstant(ZoneId.of("Asia/Shanghai")).toLocalDate().minusDays(1).toString(), metadata.get("executionAsOfDate"));
        Map<String,Object> blocks = object(result, "blocks");
        assertEquals(new LinkedHashSet<>(Arrays.asList("overview", "actualDetails", "frequentDishes", "categoryCounts", "planExecution", "completeness")), blocks.keySet());
        assertEquals(1, object(blocks,"overview").get("mealCount"));
        List<?> rows = (List<?>)object(blocks,"actualDetails").get("records");
        assertEquals(1, rows.size());
        Map<?,?> row = (Map<?,?>)rows.get(0);
        assertEquals("/pages/calendar-detail/calendar-detail?date=2026-01-01&mealType=lunch", row.get("sourceUrl"));
        assertEquals(4L, row.get("id")); assertEquals(1L, row.get("revision"));
        Map<String,Object> complete = object(blocks,"completeness");
        assertEquals(1, complete.get("freeTextEntryCount")); assertEquals(1, complete.get("unclassifiedCount"));
        assertEquals(1, complete.get("explicitSkippedMeals"));
        assertEquals(5, complete.get("daysWithoutActualRecord"));
        assertEquals(false, complete.get("nutritionAvailable"));
        assertFalse(complete.containsKey("completionRate")); assertFalse(result.containsKey("calories"));
    }
    @Test void sourceIdentityIsOrderIndependentAndChangesOnRevisionOrAccount() {
        MealConsumption first = meal(1, start, "lunch", "eaten", "[{\"dishId\":7,\"name\":\"青菜\",\"type\":\"veg\"}]");
        MealConsumption second = meal(2, "2026-01-02", "dinner", "unrecorded", "[]");
        RecipeRecord pending = plan(3, "2026-01-03", "dinner");
        Map<String,Object> a = object(report(1, Arrays.asList(first, second), Collections.singletonList(pending)), "metadata");
        first.setActualDishesJson("[{\"type\":\"veg\",\"name\":\"青菜\",\"dishId\":7}]");
        Map<String,Object> b = object(report(1, Arrays.asList(second, first), Collections.singletonList(pending)), "metadata");
        assertEquals(a.get("sourceFingerprint"), b.get("sourceFingerprint")); assertEquals(a.get("reportId"), b.get("reportId"));
        first.setRevision(2L);
        Map<String,Object> corrected = object(report(1, Arrays.asList(second, first), Collections.singletonList(pending)), "metadata");
        assertNotEquals(a.get("reportId"), corrected.get("reportId"));
        assertNotEquals(corrected.get("reportId"), object(report(2, Arrays.asList(second, first), Collections.singletonList(pending)),"metadata").get("reportId"));
        pending.setRevision(2L);
        assertNotEquals(corrected.get("reportId"), object(report(1, Arrays.asList(first, second), Collections.singletonList(pending)),"metadata").get("reportId"));
        verify(actual, atLeastOnce()).range(1L,start,end);
        verify(actual).range(2L,start,end);
    }
    @Test void emptyActualsKeepUnconfirmedPlansAndExplicitMissingnessSeparate() {
        Map<String,Object> result = report(1, Collections.singletonList(meal(5,start,"lunch","unrecorded","[]")), Collections.singletonList(plan(3,start,"dinner")));
        Map<String,Object> blocks = object(result,"blocks");
        assertEquals(0, object(blocks,"overview").get("mealCount"));
        assertEquals(1, object(blocks,"planExecution").get("unconfirmedMeals"));
        assertEquals(0, object(blocks,"planExecution").get("skippedMeals"));
        Map<String,Object> complete=object(blocks,"completeness");
        assertEquals(1, complete.get("explicitUnrecordedMeals"));
        assertEquals(6, complete.get("daysWithoutActualRecord"));
        assertEquals(0, complete.get("actualMealsWithoutDishes"));
        assertEquals(Collections.emptyList(), object(blocks,"actualDetails").get("records"));
    }
    @Test void dateStringPlansCountAndRepeatedDishIsOneAppearancePerMeal() {
        MealConsumption eaten = meal(4,start,"lunch","eaten","[{\"dishId\":7,\"name\":\"青菜\",\"type\":\"veg\"},{\"dishId\":7,\"name\":\"青菜\",\"type\":\"veg\"}]");
        Map<String,Object> result = new DietReviewCalculator(json).calculate(Collections.singletonList(eaten),Collections.singletonList(plan(8,start,"dinner")),LocalDate.of(2026,1,2));
        assertEquals(1,result.get("plannedMealsDue"));
        assertEquals(1,result.get("unconfirmedMeals"));
        assertEquals(2,result.get("entryCount"));
        assertEquals(1, ((Map<?,?>)((List<?>)result.get("popularDishes")).get(0)).get("count"));
    }
    @Test void reportIdentityExcludesRefreshTimeButIncludesShanghaiDayAndPeriod() {
        DietReviewCalculator calculator = new DietReviewCalculator(json);
        List<MealConsumption> none = Collections.emptyList();
        List<RecipeRecord> noPlans = Collections.emptyList();
        LocalDate a = LocalDate.of(2026,1,1), b = LocalDate.of(2026,1,7);
        Map<String,Object> first = calculator.report(1L,none,noPlans,a,b,Instant.parse("2026-01-03T16:00:00Z"));
        Map<String,Object> refresh = calculator.report(1L,none,noPlans,a,b,Instant.parse("2026-01-04T15:59:00Z"));
        Map<String,Object> nextDay = calculator.report(1L,none,noPlans,a,b,Instant.parse("2026-01-04T16:00:00Z"));
        assertEquals(object(first,"metadata").get("reportId"),object(refresh,"metadata").get("reportId"));
        assertNotEquals(object(first,"metadata").get("generatedAt"),object(refresh,"metadata").get("generatedAt"));
        assertNotEquals(object(first,"metadata").get("reportId"),object(nextDay,"metadata").get("reportId"));
        assertEquals(4,object(object(first,"blocks"),"completeness").get("observedDays"));
        assertEquals(4,object(object(first,"blocks"),"completeness").get("daysWithoutActualRecord"));
        Map<String,Object> otherPeriod=calculator.report(1L,none,noPlans,a,b.plusDays(1),Instant.parse("2026-01-03T16:00:00Z"));
        assertNotEquals(object(first,"metadata").get("reportId"),object(otherPeriod,"metadata").get("reportId"));
        Map<String,Object> future=calculator.report(1L,none,noPlans,a.plusMonths(1),b.plusMonths(1),Instant.parse("2026-01-03T16:00:00Z"));
        assertEquals(0,object(object(future,"blocks"),"completeness").get("observedDays"));
        assertEquals(0,object(object(future,"blocks"),"completeness").get("daysWithoutActualRecord"));
    }
    @Test void savedActualSnapshotSurvivesDeletedPlanAndUnknownFoodRemainsVisible() {
        MealConsumption meal=meal(4,start,"dinner","eaten","[{\"dishId\":7,\"name\":\"历史菜品\",\"type\":\"veg\"},{\"name\":\"外食\"}]");
        meal.setSourceRecordId(99L);
        meal.setPlannedSnapshotJson("{\"recordOrigin\":\"manual\",\"confirmedAsPlanned\":true}");
        Map<String,Object> result=report(1,Collections.singletonList(meal),Collections.emptyList());
        Map<String,Object> blocks=object(result,"blocks");
        assertEquals(1,object(blocks,"planExecution").get("plannedMealsDue"));
        assertEquals(1,object(blocks,"planExecution").get("plannedMealsFollowed"));
        Map<?,?> row=(Map<?,?>)((List<?>)object(blocks,"actualDetails").get("records")).get(0);
        List<?> dishes=(List<?>)row.get("actualDishes");
        assertEquals("历史菜品",((Map<?,?>)dishes.get(0)).get("name"));
        assertEquals("外食",((Map<?,?>)dishes.get(1)).get("name"));
        assertEquals(1,object(blocks,"completeness").get("freeTextEntryCount"));
    }

}
