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
  assertEquals(fixture.w.getContext().getPeople(),row.get("diners"));
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
 @Test void actualReadExposesOnlyRecordedNutritionAndNeverCalendarNutrition(){
  AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();
  com.eatwhat.entity.MealConsumption meal=new com.eatwhat.entity.MealConsumption();meal.setUserId(7L);meal.setMealDate("2026-10-01");meal.setMealType("dinner");meal.setStatus("eaten");
  meal.setActualDishesJson("[{\"dishId\":1,\"name\":\"青菜\",\"nutritionSnapshot\":{\"basis\":\"recipe_baseline\",\"completeness\":\"complete\",\"total\":{\"energyKcal\":100.6,\"proteinG\":2,\"fatG\":3,\"carbohydrateG\":4,\"fiberG\":1,\"sodiumMg\":50}}}]");
  when(f.meals.overview(anyLong(),anyString(),anyString())).thenReturn(AssistantV4ContextService.map("plans",Collections.emptyList(),"consumptions",Arrays.asList(meal)));
  ToolRead call=f.call("read_actual_diet_review","startDate","2026-10-01","endDate","2026-10-01");ReadResult read=f.reads().read(7L,call,f.scope);
  String reply=new AssistantFactReplyFormatter().format(Arrays.asList(AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read,call)),new ModelContext());
  assertTrue(reply.contains("101千卡"),reply);assertTrue(reply.contains("不代表个人摄入"),reply);
 }
}
