package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DietNutritionSummaryTest {
 private final ObjectMapper json=new ObjectMapper();
 private Dish dish(String completeness) throws Exception {
  Dish dish=new Dish();dish.setId(1L);dish.setCatalogRevision("test-v4");
  ObjectNode recipe=json.createObjectNode();recipe.put("baseServings",2);
  ObjectNode nutrition=recipe.putObject("calculatedNutrition");nutrition.put("completeness",completeness);
  ObjectNode total=nutrition.putObject("total");for(String key:CanonicalRecipeCalculator.NUTRIENTS)total.put(key,10);
  dish.setRecipe(recipe);return dish;
 }
 private Map<String,Object> entry(Map<String,Object> snapshot){Map<String,Object> entry=new LinkedHashMap<>();entry.put("nutritionSnapshot",snapshot);return entry;}
 @Test void copiesWholeDishSnapshotAndNeverPersonalIntake() throws Exception {
  Dish dish=dish("complete");Map<String,Object> snapshot=DietNutritionSummary.snapshot(dish,json);
  ((ObjectNode)dish.getRecipe().path("calculatedNutrition").path("total")).put("energyKcal",999);
  Map<String,Object> report=DietNutritionSummary.summarize(Arrays.asList(entry(snapshot)),json);
  assertEquals("recipe_baseline",report.get("basis"));assertEquals(false,report.get("personalIntakeAvailable"));
  assertEquals(1,report.get("coveredCount"));assertEquals(0,report.get("unknownCount"));
  assertEquals(10,((Number)((Map<?,?>)report.get("total")).get("energyKcal")).intValue());
 }
 @Test void partialAndLegacyRowsCannotProduceFalseTotal() throws Exception {
  Map<String,Object> partial=DietNutritionSummary.snapshot(dish("partial"),json);
  assertNull(partial.get("total"));
  Map<String,Object> report=DietNutritionSummary.summarize(Arrays.asList(entry(partial),Collections.emptyMap(),entry(DietNutritionSummary.snapshot(dish("complete"),json))),json);
  assertEquals(1,report.get("coveredCount"));assertEquals(2,report.get("unknownCount"));assertNull(report.get("total"));assertNotNull(report.get("knownTotal"));
  assertNull(DietNutritionSummary.summarize(Collections.emptyList(),json).get("total"));
 }
 @Test void malformedSnapshotIsUnknownNotZero() throws Exception {
  Map<String,Object> snapshot=DietNutritionSummary.snapshot(dish("complete"),json);
  ((Map<?,?>)snapshot.get("total")).remove("proteinG");
  Map<String,Object> report=DietNutritionSummary.summarize(Arrays.asList(entry(snapshot)),json);
  assertEquals(0,report.get("coveredCount"));assertNull(report.get("knownTotal"));
 }
}
