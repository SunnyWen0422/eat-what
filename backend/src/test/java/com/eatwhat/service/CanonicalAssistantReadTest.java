package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CanonicalAssistantReadTest {
 @Test void fullReadUsesCanonicalRecipeAndNoLegacyQuantityStatus(){
  AssistantReadToolTest.Fixture fixture=new AssistantReadToolTest.Fixture();Dish dish=CanonicalAssistantFixture.enrich(AssistantReadToolTest.Fixture.dish(999,"鱼香青菜"));
  dish.setCl("旧材料：9999克");dish.setSteps("旧步骤");when(fixture.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Collections.singletonList(dish));
  ReadResult result=fixture.reads().read(7L,fixture.call("get_dish_methods","dish_id",999L),fixture.scope);
  Map<String,Object> row=result.getItems().get(0);assertEquals("canonical-fixture-2",row.get("catalogRevision"));assertEquals("炒熟",row.get("steps"));assertEquals("青菜",row.get("ingredients"));
  assertFalse(fixture.json.valueToTree(row).toString().contains("9999"));assertFalse(fixture.json.valueToTree(row).toString().contains("quantityStatus"));
  assertEquals(Collections.singletonList("DIET_VEGAN"),row.get("dietaryCodes"));
 }
 @Test void missingRecipeNeverFallsBackToCl(){
  AssistantReadToolTest.Fixture fixture=new AssistantReadToolTest.Fixture();Dish dish=new Dish();dish.setId(999L);dish.setName("旧菜");dish.setCl("青菜：100克");
  when(fixture.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Collections.singletonList(dish));
  assertThrows(IllegalStateException.class,()->fixture.reads().read(7L,fixture.call("get_dish_details","dish_ids",Collections.singletonList(999L)),fixture.scope));
 }
 @Test void ingredientIdentityDoesNotSplitCornstarchAndMealsAreHardFacts(){
  Dish dish=CanonicalAssistantFixture.enrich(AssistantReadToolTest.Fixture.dish(1,"玉米淀粉"));
  ObjectNode ingredient=(ObjectNode)dish.getRecipe().path("ingredients").get(0);ingredient.put("ingredientId","cornstarch");ObjectNode definition=(ObjectNode)ingredient.path("ingredient");definition.put("id","cornstarch");definition.put("name","玉米淀粉");definition.putArray("aliases").add("生粉");
  assertFalse(CanonicalAssistantFacts.terms(dish).contains("玉米"));assertTrue(CanonicalAssistantFacts.terms(dish).contains("生粉"));
  assertTrue(CanonicalAssistantFacts.additional(dish,Collections.singletonMap("meal_codes",Collections.singletonList("MEAL_BREAKFAST"))));
  assertFalse(CanonicalAssistantFacts.additional(dish,Collections.singletonMap("meal_codes",Collections.singletonList("MEAL_SNACK"))));
 }
}
