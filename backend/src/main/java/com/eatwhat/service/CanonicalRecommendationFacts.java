package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
/** Facts come only from the canonical formulation, never recipe prose. */
final class CanonicalRecommendationFacts {
 static Set<String> mainNames(Dish dish){return names(dish,true);}
 static Set<String> names(Dish dish,boolean mainOnly){
  Set<String> out=new LinkedHashSet<>();if(dish.getRecipe()==null)return out;
  for(JsonNode line:dish.getRecipe().path("ingredients")){
   if(!line.path("defaultEnabled").asBoolean(true))continue;
   if(mainOnly&&!"main".equals(line.path("role").asText()))continue;
   JsonNode ingredient=line.path("ingredient");out.add(line.path("ingredientId").asText());
   add(out,ingredient.path("name").asText());for(JsonNode alias:ingredient.path("aliases"))add(out,alias.asText());
   if(!mainOnly)for(JsonNode constituent:ingredient.path("constituentIngredients"))addIngredient(out,constituent);
  }out.remove("");return out;
 }
 private static void add(Set<String> out,String value){if(!value.isEmpty())out.add(value.trim().toLowerCase(Locale.ROOT));}
 private static void addIngredient(Set<String> out,JsonNode ingredient){add(out,ingredient.path("id").asText());add(out,ingredient.path("name").asText());for(JsonNode alias:ingredient.path("aliases"))add(out,alias.asText());for(JsonNode child:ingredient.path("constituentIngredients"))addIngredient(out,child);}
 static boolean excludes(Dish dish,List<String> terms){
  if(terms==null||terms.isEmpty())return false;
  if(dish.getRecipe()==null)throw new IllegalStateException("Canonical recipe unavailable for ingredient exclusion");
  Set<String> names=names(dish,false);
  for(String term:terms)if(term!=null&&!term.trim().isEmpty()&&names.contains(term.trim().toLowerCase(Locale.ROOT)))return true;
  return false;
 }
 static boolean automatic(Dish dish,String meal){
  JsonNode recipe=dish.getRecipe();if(recipe==null||!"dish".equals(recipe.path("servingRole").asText()))return false;
  String code="MEAL_"+meal.toUpperCase(Locale.ROOT);for(JsonNode m:recipe.path("mealCodes"))if(code.equals(m.asText()))return true;return false;
 }
}
