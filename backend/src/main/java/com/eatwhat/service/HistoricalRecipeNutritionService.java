package com.eatwhat.service;

import com.eatwhat.entity.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.stereotype.Service;
import java.util.*;

/** Recalculates a view of saved formulation facts against current ingredient standards.
 * Never resolves a saved dish ID to today's recipe and never writes a business row. */
@Service
public class HistoricalRecipeNutritionService {
 private final CanonicalCatalogService catalog;
 private final ObjectMapper json;
 private final CanonicalRecipeCalculator calculator=new CanonicalRecipeCalculator();
 public HistoricalRecipeNutritionService(CanonicalCatalogService catalog,ObjectMapper json){this.catalog=catalog;this.json=json.copy().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);}
 public String currentVersion(){return fingerprint(json.valueToTree(Arrays.asList("historical-current-standards-v1",CanonicalRecipeCalculator.RULE_VERSION,catalog.metadata())));}

 /** Detached return values only: source JSON/version remain the confirmation facts. */
 public List<RecipeRecord> displayRecords(Long user,List<RecipeRecord> records){
  List<Dish> originals=ownedDishes(user,records);
  Map<Dish,Map<String,Object>> nutrition=snapshots(originals);
  List<RecipeRecord> result=new ArrayList<>();
  for(RecipeRecord record:MealRecordProjection.latestRecords(records)){
   if(Boolean.TRUE.equals(record.getIsDeleted()))continue;
   RecipeRecord copy=new RecipeRecord();org.springframework.beans.BeanUtils.copyProperties(record,copy);
   List<Dish> dishes=new ArrayList<>();
   for(Dish source:record.getDishDetails()){
    dishes.add(displayDish(source,nutrition.get(source)));
   }
   copy.setDishDetails(dishes);copy.setDishIds(new ArrayList<>(record.getDishIds()));
   result.add(copy);
  }
  return result;
 }

 /** Detached workspace presentation; never replaces stored formulation or confirmation facts. */
 public List<Dish> displayDishes(Long user,List<Dish> sources){
  for(Dish dish:sources)if(dish.getUserId()!=null&&!Objects.equals(user,dish.getUserId()))throw new IllegalArgumentException("历史菜谱不可访问");
  Map<Dish,Map<String,Object>> values=snapshots(sources);List<Dish> out=new ArrayList<>();
  for(Dish dish:sources)out.add(displayDish(dish,values.get(dish)));return out;
 }
 private Dish displayDish(Dish source,Map<String,Object> facts){
    Dish dish=com.eatwhat.util.DishSnapshotReader.convert(json,source,Dish.class);
    JsonNode view=dish.getRecipe();
    // Retain the immutable calculation document as well as the trusted receipt hash.
    if(source.getRecipeJson()!=null){dish.setRecipeJson(source.getRecipeJson());if(view!=null&&view.isObject()){ObjectNode target=(ObjectNode)dish.getRecipe();target.removeAll();target.setAll((ObjectNode)view);}}
    ObjectNode calculated=json.createObjectNode();calculated.put("scope",CanonicalRecipeCalculator.NUTRITION_SCOPE);calculated.put("description",CanonicalRecipeCalculator.NUTRITION_DESCRIPTION);calculated.put("ruleVersion",CanonicalRecipeCalculator.RULE_VERSION);calculated.put("completeness",String.valueOf(facts.get("completeness")));calculated.set("total",json.valueToTree(facts.get("total")));calculated.putNull("perServing");calculated.put("perServingUnavailableReason","diners_not_specified");
    if(dish.getRecipe()!=null&&dish.getRecipe().isObject()){
     ObjectNode recipe=(ObjectNode)dish.getRecipe();recipe.set("calculatedNutrition",calculated);recipe.put("nutritionVersion",String.valueOf(facts.get("nutritionVersion")));
    }
    if(dish.getScaledRecipe()!=null&&dish.getScaledRecipe().isObject())((ObjectNode)dish.getScaledRecipe()).set("nutrition",calculated.deepCopy());
    dish.setKcal(null);dish.restoreReceiptContentVersion(source.getContentVersion());return dish;
 }

 public List<MealConsumption> project(Long user,List<RecipeRecord> records){
  return MealRecordProjection.from(records,snapshots(ownedDishes(user,records)));
 }
 private List<Dish> ownedDishes(Long user,List<RecipeRecord> records){
  List<Dish> dishes=new ArrayList<>();
  for(RecipeRecord record:records)if(record!=null&&record.getUserId()!=null&&!Objects.equals(user,record.getUserId()))throw new IllegalArgumentException("餐次记录不可访问");
  for(RecipeRecord record:MealRecordProjection.latestRecords(records)){
   if(record.getUserId()!=null&&!Objects.equals(user,record.getUserId()))throw new IllegalArgumentException("餐次记录不可访问");
   if(Boolean.TRUE.equals(record.getIsDeleted()))continue;
   for(Dish dish:record.getDishDetails()){
    if(dish.getUserId()!=null&&!Objects.equals(user,dish.getUserId()))throw new IllegalArgumentException("历史菜谱不可访问");
    dishes.add(dish);
   }
  }
  return dishes;
 }

 public Map<Dish,Map<String,Object>> snapshots(Collection<Dish> dishes){
  Map<Dish,JsonNode> recipes=new IdentityHashMap<>();Set<String> ids=new TreeSet<>();
  for(Dish dish:dishes){JsonNode recipe=savedRecipe(dish);recipes.put(dish,recipe);for(JsonNode line:recipe.path("ingredients"))if(line.path("ingredientId").isTextual()&&!line.path("ingredientId").asText().trim().isEmpty())ids.add(line.path("ingredientId").asText());}
  Map<String,JsonNode> standards=catalog.ingredientDefinitions(ids,true);
  JsonNode metadata=catalog.metadata();String version=fingerprint(json.valueToTree(Arrays.asList("historical-current-standards-v1",CanonicalRecipeCalculator.RULE_VERSION,metadata,new TreeMap<>(standards))));
  Map<Dish,Map<String,Object>> out=new IdentityHashMap<>();
  for(Dish dish:dishes){
   JsonNode recipe=recipes.get(dish);Map<String,Object> value=new LinkedHashMap<>();
   value.put("basis","recipe_baseline");value.put("scope",CanonicalRecipeCalculator.NUTRITION_SCOPE);value.put("description",CanonicalRecipeCalculator.NUTRITION_DESCRIPTION);value.put("catalogRevision",metadata.path("catalogRevision").asText());
   value.put("originalCatalogRevision",dish.getCatalogRevision());value.put("contentVersion",dish.getContentVersion());value.put("originalRecipeVersion",dish.getContentVersion());
   value.put("nutritionVersion",version);value.put("nutritionRuleVersion",CanonicalRecipeCalculator.RULE_VERSION);
   value.put("catalogContractVersion",4);value.put("quantityPolicy","fixed-recipe-v1");
   value.put("baseServings",recipe.path("baseServings").isNumber()?recipe.path("baseServings").decimalValue():null);
   value.put("completeness","partial");value.put("total",null);
   try{
    validateIdentity(dish,recipe,standards);
    JsonNode nutrition=calculator.calculate(recipe,standards,null).path("nutrition");
    if("complete".equals(nutrition.path("completeness").asText())){
     value.put("completeness","complete");value.put("total",json.convertValue(nutrition.path("total"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){}));
    }
   }catch(IllegalArgumentException invalidSavedFacts){
    // Unknown legacy identities, specifications or quantities cannot be repaired by guessing.
   }
   out.put(dish,value);
  }
  return out;
 }

 private JsonNode savedRecipe(Dish dish){
  if(dish==null)return json.createObjectNode();
  try{return dish.getRecipeJson()==null?(dish.getRecipe()==null?json.createObjectNode():dish.getRecipe().deepCopy()):json.readTree(dish.getRecipeJson());}
  catch(java.io.IOException invalid){return json.createObjectNode();}
 }
 private void validateIdentity(Dish dish,JsonNode recipe,Map<String,JsonNode> standards){
  if(recipe.has("catalogContractVersion")&&recipe.path("catalogContractVersion").asInt()!=4)throw new IllegalArgumentException("Historical contract unavailable");
  for(JsonNode line:recipe.path("ingredients")){
   String id=line.path("ingredientId").asText();JsonNode current=standards.get(id);
   if(current==null)throw new IllegalArgumentException("Unknown historical ingredient");
   // Public snapshots retain the original specification beside the saved line.
   JsonNode original=line.path("ingredient");
   if(original.isMissingNode()&&dish.getRecipe()!=null)for(JsonNode shown:dish.getRecipe().path("ingredients"))if(line.path("id").equals(shown.path("id"))){original=shown.path("ingredient");break;}
   if(original.hasNonNull("id")&&!id.equals(original.path("id").asText()))throw new IllegalArgumentException("Historical ingredient identity mismatch");
   if(original.hasNonNull("specification")&&!original.path("specification").equals(current.path("specification")))throw new IllegalArgumentException("Historical ingredient specification mismatch");
  }
 }
 private String fingerprint(JsonNode node){return WorkflowRequestHash.sha256(canonical(node).toString());}
 private JsonNode canonical(JsonNode node){
  if(node.isObject()){ObjectNode sorted=json.createObjectNode();TreeSet<String> keys=new TreeSet<>();node.fieldNames().forEachRemaining(keys::add);for(String key:keys)sorted.set(key,canonical(node.get(key)));return sorted;}
  if(node.isArray()){ArrayNode array=json.createArrayNode();node.forEach(value->array.add(canonical(value)));return array;}
  return node;
 }
}
