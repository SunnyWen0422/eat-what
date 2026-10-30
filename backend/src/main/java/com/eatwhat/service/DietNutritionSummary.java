package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/** Historical recipe-quantity reference only; it cannot infer an individual's intake. */
final class DietNutritionSummary {
 private DietNutritionSummary(){}
 static Map<String,Object> snapshot(Dish dish,ObjectMapper json){
  Map<String,Object> result=new LinkedHashMap<>();JsonNode recipe=dish.getRecipe();
  result.put("basis","recipe_baseline");result.put("scope",CanonicalRecipeCalculator.NUTRITION_SCOPE);result.put("description",CanonicalRecipeCalculator.NUTRITION_DESCRIPTION);result.put("catalogRevision",dish.getCatalogRevision());result.put("contentVersion",dish.getContentVersion());
  result.put("baseServings",recipe!=null&&recipe.path("baseServings").isNumber()?recipe.path("baseServings").decimalValue():null);
  if(recipe!=null&&recipe.path("nutritionVersion").isTextual())result.put("nutritionVersion",recipe.path("nutritionVersion").asText());
  JsonNode nutrition=recipe==null?json.nullNode():recipe.path("calculatedNutrition");
  Map<String,BigDecimal> total=CanonicalRecipeCalculator.NUTRITION_SCOPE.equals(nutrition.path("scope").asText())&&"complete".equals(nutrition.path("completeness").asText())?total(nutrition.path("total")):null;
  result.put("completeness",total==null?"partial":"complete");result.put("total",total);return result;
 }
 static Map<String,Object> summarize(List<Map<String,Object>> entries,ObjectMapper json){
  Map<String,BigDecimal> known=new LinkedHashMap<>();for(String key:CanonicalRecipeCalculator.NUTRIENTS)known.put(key,BigDecimal.ZERO);
  int covered=0;
  Set<String> versions=new TreeSet<>();
  for(Map<String,Object> entry:entries){
   JsonNode snapshot=json.valueToTree(entry.get("nutritionSnapshot"));
   if(snapshot!=null&&snapshot.path("nutritionVersion").isTextual())versions.add(snapshot.path("nutritionVersion").asText());
   if(snapshot==null||!CanonicalRecipeCalculator.NUTRITION_SCOPE.equals(snapshot.path("scope").asText())||!"recipe_baseline".equals(snapshot.path("basis").asText())||!"complete".equals(snapshot.path("completeness").asText()))continue;
   Map<String,BigDecimal> value=total(snapshot.path("total"));if(value==null)continue;covered++;
   for(String key:known.keySet())known.put(key,known.get(key).add(value.get(key)));
  }
  boolean complete=!entries.isEmpty()&&covered==entries.size();Map<String,Object> result=new LinkedHashMap<>();
  result.put("basis","recipe_baseline");result.put("scope",CanonicalRecipeCalculator.NUTRITION_SCOPE);result.put("description",CanonicalRecipeCalculator.NUTRITION_DESCRIPTION);result.put("personalIntakeAvailable",false);result.put("entryCount",entries.size());result.put("coveredCount",covered);result.put("unknownCount",entries.size()-covered);result.put("complete",complete);
  if(!versions.isEmpty())result.put("nutritionVersion",com.eatwhat.util.WorkflowRequestHash.sha256(String.join("|",versions)));
  known.put("energyKcal",known.get("energyKcal").setScale(0,RoundingMode.HALF_UP));
  result.put("knownTotal",covered==0?null:known);result.put("total",complete?known:null);return result;
 }
 private static Map<String,BigDecimal> total(JsonNode node){
  if(!node.isObject())return null;Map<String,BigDecimal> result=new LinkedHashMap<>();
  for(String key:CanonicalRecipeCalculator.NUTRIENTS){JsonNode value=node.path(key);if(!value.isNumber())return null;BigDecimal number;try{number=value.decimalValue();}catch(NumberFormatException e){return null;}if(number.signum()<0)return null;result.put(key,number);}return result;
 }
}
