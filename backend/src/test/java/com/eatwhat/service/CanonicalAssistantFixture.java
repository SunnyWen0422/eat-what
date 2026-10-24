package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;

final class CanonicalAssistantFixture {
 static Dish enrich(Dish d){
  ObjectMapper json=new ObjectMapper();ObjectNode recipe=json.createObjectNode();recipe.put("quantityPolicy","fixed-recipe-v1");recipe.put("id",d.getId());recipe.put("name",d.getName());recipe.put("baseServings",3);
  recipe.put("categoryCode","CAT_VEGETABLE_LEAF");recipe.putArray("mealCodes").add("MEAL_BREAKFAST").add("MEAL_LUNCH").add("MEAL_DINNER");recipe.putArray("dietaryCodes").add("DIET_VEGAN");recipe.putArray("allergenCodes");recipe.putArray("methodCodes").add("METHOD_STIR_FRY");
  recipe.putObject("timing").put("totalMinutes",15);recipe.put("servingRole","dish");
  ObjectNode ingredient=recipe.putArray("ingredients").addObject();ingredient.put("id","i1");ingredient.put("ingredientId","green");ingredient.put("quantity",150);ingredient.put("quantityKind","exact");ingredient.put("unit","g");ingredient.put("role","main");ingredient.put("optional",false);ingredient.put("defaultEnabled",true);ingredient.put("preparation","切块");
  ObjectNode definition=ingredient.putObject("ingredient");definition.put("id","green");definition.put("name","青菜");definition.putArray("aliases").add("油菜");
  ObjectNode step=recipe.putArray("steps").addObject();step.put("id","s1");step.put("text","炒熟");step.putArray("ingredientLineIds").add("i1");
  d.setRecipe(recipe);d.setCatalogRevision("canonical-fixture-2");return d;
 }
}
