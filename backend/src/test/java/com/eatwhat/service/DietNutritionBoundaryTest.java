package com.eatwhat.service;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Exercises stored snapshots through the real request, consumption and report boundaries. */
class DietNutritionBoundaryTest {
    private final ObjectMapper json = new ObjectMapper();
    private final MealConsumptionMapper records = mock(MealConsumptionMapper.class);
    private final RecipeRecordMapper plans = mock(RecipeRecordMapper.class);
    private final DishQueryService catalog = mock(DishQueryService.class);
    private final MealConsumptionService service = new MealConsumptionService(records, plans, catalog, json, new DietReviewCalculator(json));
    DietNutritionBoundaryTest() { when(records.request(anyLong(),anyString())).thenReturn(null); }

    private Dish dish(int energy, String completeness) {
        Dish dish = new Dish(); dish.setId(9L); dish.setName("记录时的配方"); dish.setType("veg"); dish.setCatalogRevision("test-v4");
        ObjectNode recipe = json.createObjectNode(); recipe.put("baseServings",2);
        ObjectNode nutrition = recipe.putObject("calculatedNutrition"); nutrition.put("completeness",completeness);
        ObjectNode total = nutrition.putObject("total");
        for (String key : CanonicalRecipeCalculator.NUTRIENTS) total.put(key, "energyKcal".equals(key) ? energy : 0);
        dish.setRecipe(recipe); return dish;
    }
    private MealConsumptionRequest request(String id) {
        MealConsumptionRequest request = new MealConsumptionRequest(); request.setRequestId(id); request.setExpectedRevision(0L); request.setStatus("eaten"); return request;
    }
    private Map<?,?> snapshot(MealConsumption meal) { return (Map<?,?>) meal.getActualDishes().get(0).get("nutritionSnapshot"); }
    private int energy(Map<?,?> snapshot) { return ((Number)((Map<?,?>)snapshot.get("total")).get("energyKcal")).intValue(); }

    @Test void requestCannotSupplyNutritionAndRetainingAnOwnedEntryKeepsItsHistoricalVersion() throws Exception {
        when(records.lockUser(1L)).thenReturn(1L);
        Dish original = dish(10,"complete"); when(catalog.getDishById(9L,1L)).thenReturn(original);
        // Spring's permissive unknown-field mode must not create a writable nutrition field.
        ObjectMapper transport = json.copy().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        MealConsumptionRequest incoming = transport.readValue("{\"requestId\":\"nutrition-input\",\"expectedRevision\":0,\"status\":\"eaten\",\"dishes\":[{\"dishId\":9,\"nutritionSnapshot\":{\"completeness\":\"complete\",\"total\":{\"energyKcal\":999}}}]}",MealConsumptionRequest.class);
        MealConsumption saved = service.save(1L,"2026-01-01","dinner",incoming);
        assertEquals(10,energy(snapshot(saved))); String version = (String)snapshot(saved).get("contentVersion");
        original.setRecipe(dish(900,"complete").getRecipe());
        when(records.find(1L,"2026-01-01","dinner")).thenReturn(saved);
        MealConsumptionRequest retained = request("nutrition-retain"); retained.setExpectedRevision(1L);
        MealConsumptionRequest.Entry entry = new MealConsumptionRequest.Entry(); entry.setRetainedEntryIndex(0); retained.setDishes(Collections.singletonList(entry));
        MealConsumption edited = service.save(1L,"2026-01-01","dinner",retained);
        assertEquals(10,energy(snapshot(edited))); assertEquals(version,snapshot(edited).get("contentVersion"));
        verify(catalog,times(1)).getDishById(9L,1L);
        MealConsumptionRequest free = transport.readValue("{\"requestId\":\"nutrition-free\",\"expectedRevision\":0,\"status\":\"eaten\",\"dishes\":[{\"name\":\"外食\",\"nutritionSnapshot\":{\"completeness\":\"complete\"}}]}",MealConsumptionRequest.class);
        assertFalse(service.save(1L,"2026-01-02","dinner",free).getActualDishes().get(0).containsKey("nutritionSnapshot"));
    }

    @Test void eatingAsPlannedUsesTheSavedBaselineAndSkippingDoesNotCopyNutrition() {
        when(records.lockUser(1L)).thenReturn(1L);
        Dish original = dish(10,"complete"); RecipeRecord plan = new RecipeRecord();
        plan.setId(8L); plan.setUserId(1L); plan.setRevision(1L); plan.setRecordOrigin("manual"); plan.setRecipeName("历史安排");
        plan.setDishIds(Collections.singletonList(9L)); plan.setDishDetails(Collections.singletonList(original));
        when(plans.findSlot(1L,"2026-01-01","dinner")).thenReturn(plan);
        original.setRecipe(dish(900,"complete").getRecipe());
        MealConsumptionRequest request = request("planned-nutrition"); request.setUsePlan(true); request.setExpectedPlanRevision(1L);
        MealConsumption saved = service.save(1L,"2026-01-01","dinner",request);
        assertEquals(10,energy(snapshot(saved))); verifyNoInteractions(catalog);
        request.setRequestId("skipped-nutrition"); request.setStatus("skipped");
        assertTrue(service.save(1L,"2026-01-01","dinner",request).getActualDishes().isEmpty());
    }

    private Map<String,Object> entry(Dish dish) {
        Map<String,Object> value = new LinkedHashMap<>(); value.put("dishId","9"); value.put("name",dish.getName()); value.put("nutritionSnapshot",DietNutritionSummary.snapshot(dish,json)); return value;
    }
    private MealConsumption meal(String date, String status, List<Map<String,Object>> entries) throws Exception {
        MealConsumption meal = new MealConsumption(); meal.setMealDate(date); meal.setMealType("dinner"); meal.setStatus(status); meal.setRevision(1L); meal.setActualDishesJson(json.writeValueAsString(entries)); return meal;
    }
    @Test void reportCountsOnlyObservedEatenEntriesAndDoesNotTurnPartialCoverageIntoTotals() throws Exception {
        List<Map<String,Object>> mixed = Arrays.asList(entry(dish(10,"complete")),entry(dish(500,"partial")),Collections.singletonMap("name","外食"));
        List<Map<String,Object>> known = Collections.singletonList(entry(dish(999,"complete")));
        List<MealConsumption> records = Arrays.asList(meal("2026-01-01","eaten",mixed),meal("2026-01-02","skipped",known),meal("2026-01-02","unrecorded",known),meal("2026-01-04","eaten",known),meal("2025-12-31","eaten",known));
        RecipeRecord onlyPlanned = new RecipeRecord(); onlyPlanned.setRecordDateString("2026-01-02"); onlyPlanned.setMealType("lunch"); onlyPlanned.setRecordOrigin("manual"); onlyPlanned.setDishDetails(Collections.singletonList(dish(888,"complete")));
        Map<String,Object> report = new DietReviewCalculator(json).report(1L,records,Collections.singletonList(onlyPlanned),LocalDate.parse("2026-01-01"),LocalDate.parse("2026-01-04"),Instant.parse("2026-01-03T04:00:00Z"));
        Map<?,?> blocks = (Map<?,?>)report.get("blocks"); Map<?,?> nutrition = (Map<?,?>)((Map<?,?>)blocks.get("actualDetails")).get("nutrition");
        assertEquals(6,blocks.size()); assertEquals(3,nutrition.get("entryCount")); assertEquals(1,nutrition.get("coveredCount")); assertEquals(2,nutrition.get("unknownCount"));
        assertEquals(false,nutrition.get("personalIntakeAvailable")); assertEquals(false,nutrition.get("complete")); assertNull(nutrition.get("total"));
        assertEquals(10,((Number)((Map<?,?>)nutrition.get("knownTotal")).get("energyKcal")).intValue());
    }
}
