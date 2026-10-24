package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
final class CanonicalCandidateFixture {
 static Dish ingredients(Dish dish,String...names){
  ObjectNode recipe=new ObjectMapper().createObjectNode();recipe.put("servingRole","dish");recipe.putArray("mealCodes").add("MEAL_BREAKFAST").add("MEAL_LUNCH").add("MEAL_DINNER");
  ArrayNode lines=recipe.putArray("ingredients");int index=0;for(String name:names){if(name==null||name.trim().isEmpty())continue;ObjectNode line=lines.addObject();line.put("id","line-"+index);line.put("ingredientId","ingredient-"+index++ + "-" + name);line.put("role","main");line.put("defaultEnabled",true);line.putObject("ingredient").put("name",name);}
  dish.setRecipe(recipe);return dish;
 }
}
