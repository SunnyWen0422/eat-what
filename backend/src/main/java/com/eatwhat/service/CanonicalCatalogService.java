package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.CanonicalCatalogMapper;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.stereotype.Service;
import java.math.*;
import java.util.*;

@Service
public class CanonicalCatalogService {
 private final CanonicalCatalogMapper mapper;private final ObjectMapper json;
 private final CanonicalRecipeCalculator calculator=new CanonicalRecipeCalculator();
 public CanonicalCatalogService(CanonicalCatalogMapper mapper,ObjectMapper json){this.mapper=mapper;this.json=json.copy().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);}
 private JsonNode parse(String value){try{if(value==null)throw new IllegalArgumentException("Canonical catalog is unavailable");return json.readTree(value);}catch(java.io.IOException e){throw new IllegalArgumentException("Invalid canonical catalog",e);}}
 // recipeJson remains the immutable persisted calculation document; recipe is its customer projection.
 private JsonNode rawRecipe(Dish dish){JsonNode raw=dish.getRecipeJson()==null?dish.getRecipe():parse(dish.getRecipeJson());if(raw==null||!raw.isObject())throw new IllegalStateException("Canonical recipe is unavailable");return raw;}
 public List<JsonNode> searchIngredients(String keyword){if(keyword==null)keyword="";if(keyword.length()>100)throw new IllegalArgumentException("Ingredient search is too long");List<JsonNode> out=new ArrayList<>();for(String value:mapper.searchIngredients(keyword.trim()))out.add(customerIngredient(parse(value)));return out;}
 public JsonNode metadata(){JsonNode value=parse(mapper.metadata());if(!value.path("catalogContractVersion").isIntegralNumber()||value.path("catalogContractVersion").asInt()!=4||!"fixed-recipe-v1".equals(value.path("quantityPolicy").asText()))throw new IllegalStateException("Canonical fixed-recipe catalog is unavailable");return value;}
 public Map<String,JsonNode> standards(Collection<Dish> dishes){
  Set<String> required=new LinkedHashSet<>();for(Dish d:dishes){if(d==null)continue;for(JsonNode i:rawRecipe(d).path("ingredients"))required.add(CanonicalRecipeCalculator.text(i,"ingredientId"));}
  Map<String,JsonNode> raw=new LinkedHashMap<>();Set<String> pending=new LinkedHashSet<>(required);
  while(!pending.isEmpty()){
   Set<String> batch=new LinkedHashSet<>(pending);pending.clear();for(String value:mapper.ingredients(batch)){JsonNode node=parse(value);raw.put(node.path("id").asText(),node);}
   for(String id:batch){JsonNode node=raw.get(id);if(node==null)throw new IllegalStateException("Canonical ingredient is unavailable: "+id);for(JsonNode child:node.path("compositionSource").path("constituents")){String childId=CanonicalRecipeCalculator.text(child,"ingredientId");if(!raw.containsKey(childId))pending.add(childId);}}
   if(raw.size()>2000)throw new IllegalStateException("Ingredient expansion exceeds catalog bounds");
  }
  Map<String,JsonNode> out=new LinkedHashMap<>();for(String id:raw.keySet())out.put(id,ingredientFacts(id,raw,new LinkedHashSet<>()));return out;
 }
 private JsonNode ingredientFacts(String id,Map<String,JsonNode> raw,Set<String> path){
  if(!path.add(id)||path.size()>20)throw new IllegalStateException("Invalid compound ingredient cycle");ObjectNode value=raw.get(id).deepCopy();ArrayNode children=value.putArray("constituentIngredients");for(JsonNode child:value.path("compositionSource").path("constituents"))children.add(ingredientFacts(child.path("ingredientId").asText(),raw,new LinkedHashSet<>(path)));return value;
 }
 /** Ranking needs canonical facts, not a second copy of every calculation and rendered step.
  * Selected dishes are materialized and enriched again before leaving the candidate boundary. */
 public List<Dish> attachFacts(List<Dish> dishes){return enrich(dishes,false);}
 public Dish enrich(Dish dish){if(dish!=null)enrich(Collections.singletonList(dish));return dish;}
 public List<Dish> enrich(List<Dish> dishes){return enrich(dishes,true);}
 private List<Dish> enrich(List<Dish> dishes,boolean completeProjection){
  if(dishes==null||dishes.isEmpty())return dishes;Map<String,JsonNode> definitions=standards(dishes);String revision=metadata().path("catalogRevision").asText();
  for(Dish d:dishes){if(d==null)continue;JsonNode raw=rawRecipe(d);ObjectNode scaled=calculator.calculate(raw,definitions,null);scaled.put("catalogRevision",revision);ObjectNode view=completeProjection?customerRecipe(raw,scaled,definitions):candidateRecipe(raw,scaled,definitions);ObjectNode target=(ObjectNode)d.getRecipe();target.removeAll();target.setAll(view);d.setScaledRecipe(completeProjection?customerCalculation(scaled):null);d.setCatalogRevision(revision);d.setQuality(null);project(d,scaled,completeProjection);}
  return dishes;
 }
 public ObjectNode scale(Dish dish,BigDecimal servings){return scale(dish,servings,Collections.emptyMap());}
 public ObjectNode scale(Dish dish,BigDecimal servings,Map<String,Boolean> overrides){
  if(dish==null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"Recipe unavailable");ObjectNode out=calculator.calculate(rawRecipe(dish),standards(Collections.singletonList(dish)),servings,overrides);out.put("catalogRevision",metadata().path("catalogRevision").asText());out.put("contentVersion",dish.getContentVersion());return customerCalculation(out);
 }
 /** Only internal selection facts. The immutable source JSON still owns the full content version. */
 private ObjectNode candidateRecipe(JsonNode raw,JsonNode scaled,Map<String,JsonNode> definitions){
  ObjectNode out=json.createObjectNode();
  for(String field:Arrays.asList("id","name","imageUrl","baseServings","categoryCode","cuisineCode","mealCodes","servingRole","dishGroupId","timing","methodCodes","flavorCodes","sceneCodes","operationCodes"))if(raw.has(field))out.set(field,raw.get(field).deepCopy());
  out.put("catalogContractVersion",4);out.put("quantityPolicy","fixed-recipe-v1");
  for(String field:Arrays.asList("dietaryCodes","allergenCodes","compositionCodes"))out.set(field,scaled.path(field).deepCopy());
  ArrayNode lines=out.putArray("ingredients");for(JsonNode source:raw.path("ingredients")){
   ObjectNode line=lines.addObject();for(String field:Arrays.asList("id","ingredientId","role","defaultEnabled","optional"))if(source.has(field))line.set(field,source.get(field).deepCopy());
   line.set("ingredient",candidateIngredient(definitions.get(source.path("ingredientId").asText())));
  }return out;
 }
 private ObjectNode candidateIngredient(JsonNode definition){
  if(definition==null)throw new IllegalStateException("Canonical ingredient unavailable");ObjectNode out=json.createObjectNode();
  for(String field:Arrays.asList("id","name","aliases"))if(definition.has(field))out.set(field,definition.get(field).deepCopy());
  if(definition.path("constituentIngredients").isArray()){ArrayNode children=out.putArray("constituentIngredients");for(JsonNode child:definition.path("constituentIngredients"))children.add(candidateIngredient(child));}return out;
 }
 private ObjectNode customerIngredient(JsonNode ingredient){
  ObjectNode out=json.createObjectNode();for(String field:Arrays.asList("id","name","aliases","group","unit","specification","animal","animalOrigins","allergens"))if(ingredient.has(field))out.set(field,ingredient.get(field).deepCopy());
  if(ingredient.path("constituentIngredients").isArray()){ArrayNode children=out.putArray("constituentIngredients");for(JsonNode child:ingredient.path("constituentIngredients"))children.add(customerIngredient(child));}return out;
 }
 private ObjectNode customerNutrition(JsonNode value){ObjectNode out=json.createObjectNode();for(String field:Arrays.asList("completeness","total","perServing","perServingUnavailableReason"))if(value.has(field))out.set(field,value.get(field).deepCopy());return out;}
 private ObjectNode customerCalculation(ObjectNode value){ObjectNode out=value.deepCopy();out.set("nutrition",customerNutrition(value.path("nutrition")));for(JsonNode row:out.path("ingredients"))((ObjectNode)row).set("ingredient",customerIngredient(row.path("ingredient")));removeInternal(out);return out;}
 private ObjectNode customerRecipe(JsonNode recipe,JsonNode scaled,Map<String,JsonNode> definitions){
  ObjectNode out=recipe.deepCopy();removeInternal(out);out.put("catalogContractVersion",4);out.put("quantityPolicy","fixed-recipe-v1");out.put("quantityBasis","fixed_recipe");out.put("portionBasis","equal_share_reference");out.putNull("diners");out.set("calculatedNutrition",customerNutrition(scaled.path("nutrition")));for(String tag:Arrays.asList("dietaryCodes","allergenCodes","compositionCodes"))out.set(tag,scaled.path(tag).deepCopy());
  for(JsonNode line:out.path("ingredients"))((ObjectNode)line).set("ingredient",customerIngredient(definitions.get(line.path("ingredientId").asText())));
  out.set("steps",scaled.path("steps").deepCopy());return out;
 }
 private void removeInternal(JsonNode value){
  if(value.isObject()){ObjectNode object=(ObjectNode)value;object.remove(Arrays.asList("provenance","compositionSource","conversionNote","definitionKnowledge","sourceSnapshot","sourceDishIds","authoringRuleVersion","dependencySha256","ruleVersion","quantifiedSubtotal","unknownLineIds","unknownReasons","scaling","scaleRule"));List<JsonNode> children=new ArrayList<>();object.elements().forEachRemaining(children::add);for(JsonNode child:children)removeInternal(child);}else if(value.isArray())for(JsonNode child:value)removeInternal(child);
 }
 /** Persist only authoring facts plus deterministic derived cache; supplied derived claims are discarded. */
 public void prepareWrite(Dish dish){
  if(dish==null||dish.getRecipe()==null||!dish.getRecipe().isObject())throw new IllegalArgumentException("请使用结构化菜谱编辑器填写材料、份数和步骤");ObjectNode recipe=dish.getRecipe().deepCopy();
  recipe.remove(Arrays.asList("calculatedNutrition","catalogRevision","scaledRecipe","provenance","dietaryCodes","allergenCodes","compositionCodes","scaling","quantityBasis","portionBasis","diners","servings"));recipe.put("quantityPolicy","fixed-recipe-v1");for(JsonNode line:recipe.path("ingredients")){if(!line.isObject())throw new IllegalArgumentException("Invalid ingredient line");((ObjectNode)line).remove(Arrays.asList("ingredient","scaleRule"));}if(dish.getId()!=null)recipe.put("id",dish.getId());else recipe.remove("id");
  CanonicalRecipeCalculator.text(recipe,"name");String category=CanonicalRecipeCalculator.text(recipe,"categoryCode");JsonNode meta=metadata(),taxonomy=meta.path("taxonomy").path("entries");if(!taxonomy.has(category)||!"category".equals(taxonomy.path(category).path("dimension").asText()))throw new IllegalArgumentException("Invalid recipe category");
  if(!recipe.path("mealCodes").isArray()||recipe.path("mealCodes").size()==0)throw new IllegalArgumentException("Recipe meals required");for(JsonNode meal:recipe.path("mealCodes"))if(!taxonomy.has(meal.asText())||!"meal".equals(taxonomy.path(meal.asText()).path("dimension").asText()))throw new IllegalArgumentException("Invalid meal");
  validateAuthoring(recipe);dish.setRecipe(recipe);Map<String,JsonNode> definitions=standards(Collections.singletonList(dish));ObjectNode scaled=calculator.calculate(recipe,definitions,null);
  ObjectNode nutrition=recipe.putObject("calculatedNutrition");nutrition.setAll((ObjectNode)scaled.path("nutrition"));nutrition.put("ruleVersion",meta.path("nutritionRuleVersion").asText());for(String tag:Arrays.asList("dietaryCodes","allergenCodes","compositionCodes"))recipe.set(tag,scaled.path(tag).deepCopy());
  if(!recipe.hasNonNull("dishGroupId"))recipe.put("dishGroupId","personal-"+UUID.randomUUID());if(!recipe.hasNonNull("servingRole"))recipe.put("servingRole","dish");dish.setRecipe(recipe);dish.setScaledRecipe(customerCalculation(scaled));project(dish,scaled);
 }
 private void validateAuthoring(ObjectNode recipe){
  if(recipe.toString().length()>1024*1024||recipe.path("name").asText().length()>255||recipe.path("steps").size()>500)throw new IllegalArgumentException("Recipe exceeds authoring limits");
  BigDecimal base=CanonicalRecipeCalculator.nullableNumber(recipe,"baseServings");if(base!=null&&(base.stripTrailingZeros().scale()>0||base.compareTo(BigDecimal.ONE)<0||base.compareTo(new BigDecimal("50"))>0))throw new IllegalArgumentException("基础份数应为1到50的整数");
  String image=recipe.path("imageUrl").asText("");if(!image.isEmpty()&&(!image.matches("(?i)^https?://[^\\s]+$")||image.length()>2048))throw new IllegalArgumentException("Invalid recipe image URL");
  for(JsonNode line:recipe.path("ingredients")){if(!line.path("optional").isBoolean()||!line.path("defaultEnabled").isBoolean())throw new IllegalArgumentException("Ingredient enabled state is required");if(!Arrays.asList("main","support","seasoning").contains(line.path("role").asText()))throw new IllegalArgumentException("Invalid ingredient role");}
  Map<String,BigDecimal> finish=new HashMap<>();BigDecimal critical=BigDecimal.ZERO,activeSum=BigDecimal.ZERO,waitSum=BigDecimal.ZERO;boolean unknownCritical=false;
  for(JsonNode step:recipe.path("steps")){
   String id=CanonicalRecipeCalculator.text(step,"id");BigDecimal active=time(step,"activeMinutes"),wait=time(step,"waitMinutes");if(!step.path("dependsOn").isArray()||!step.path("ingredientLineIds").isArray())throw new IllegalArgumentException("Step references are required");BigDecimal start=BigDecimal.ZERO;
   for(JsonNode ref:step.path("dependsOn")){if(!finish.containsKey(ref.asText()))throw new IllegalArgumentException("Step dependency must refer to an earlier step");BigDecimal prior=finish.get(ref.asText());start=start==null||prior==null?null:start.max(prior);}
   BigDecimal end=start==null||active==null||wait==null?null:start.add(active).add(wait);finish.put(id,end);if(end==null)unknownCritical=true;else critical=critical.max(end);activeSum=activeSum==null||active==null?null:activeSum.add(active);waitSum=waitSum==null||wait==null?null:waitSum.add(wait);
  }
  if(!recipe.path("timing").isObject())throw new IllegalArgumentException("Recipe timing is required");ObjectNode timing=(ObjectNode)recipe.path("timing");BigDecimal total=time(timing,"totalMinutes");time(timing,"activeMinutes");time(timing,"waitMinutes");
  if(total!=null&&total.compareTo(critical)<0)throw new IllegalArgumentException("Total time cannot be shorter than the recipe steps");if(unknownCritical)timing.putNull("totalMinutes");if(activeSum==null)timing.putNull("activeMinutes");else timing.put("activeMinutes",activeSum);if(waitSum==null)timing.putNull("waitMinutes");else timing.put("waitMinutes",waitSum);
  if((!timing.hasNonNull("totalMinutes")||timing.path("totalMinutes").decimalValue().compareTo(new BigDecimal("20"))>0)&&recipe.path("operationCodes").isArray()){ArrayNode codes=json.createArrayNode();for(JsonNode code:recipe.path("operationCodes"))if(!"OP_QUICK_20".equals(code.asText()))codes.add(code);recipe.set("operationCodes",codes);}
 }
 private BigDecimal time(JsonNode value,String key){if(!value.has(key))throw new IllegalArgumentException("Time field is required");BigDecimal n=CanonicalRecipeCalculator.nullableNumber(value,key);if(n!=null&&n.signum()<0)throw new IllegalArgumentException("Step time must be nonnegative");return n;}
 public void bindGeneratedId(Dish dish){ObjectNode recipe=rawRecipe(dish).deepCopy();recipe.put("id",dish.getId());dish.setRecipe(recipe);}
 /** Called only after source readability, ownership (for updates) and expected-version validation. */
 public void restoreUnchangedStepTemplates(Dish source,Dish edited){
  if(edited.getRecipe()==null||!edited.getRecipe().isObject())return;ObjectNode editedRecipe=edited.getRecipe().deepCopy();JsonNode original=rawRecipe(source);JsonNode rendered=calculator.calculate(original,standards(Collections.singletonList(source)),null).path("steps");
  Map<String,JsonNode> originals=new LinkedHashMap<>();for(JsonNode step:original.path("steps"))originals.put(step.path("id").asText(),step);int index=0;
  for(JsonNode value:editedRecipe.path("steps")){
   if(!value.isObject())continue;ObjectNode step=(ObjectNode)value;String id=step.path("id").asText();JsonNode template=originals.get(id);if(template==null&&index<original.path("steps").size())template=original.path("steps").get(index);index++;
   if(template!=null){for(JsonNode shown:rendered)if(template.path("id").asText().equals(shown.path("id").asText())&&step.path("text").asText().equals(shown.path("text").asText())){step.set("text",template.path("text"));break;}}
   step.remove(Arrays.asList("batchIndex","ingredientQuantities"));
  }
  edited.setRecipe(editedRecipe);
 }
 private void project(Dish d,JsonNode scaled){project(d,scaled,true);}
 private void project(Dish d,JsonNode scaled,boolean completeProjection){
  JsonNode r=d.getRecipe();d.setQuantityPolicy("fixed-recipe-v1");d.setName(r.path("name").asText());String category=r.path("categoryCode").asText();d.setType(category.startsWith("CAT_MEAT")?"meat":category.startsWith("CAT_VEGETABLE")?"veg":category.startsWith("CAT_SOUP")?"soup":category.startsWith("CAT_STAPLE")?"staple":category.startsWith("CAT_SIDE")?"side":"dessert");d.setFl(r.hasNonNull("baseServings")?r.path("baseServings").asText():null);d.setImage(r.path("imageUrl").asText(null));
  BigDecimal minutes=CanonicalRecipeCalculator.nullableNumber(r.path("timing"),"totalMinutes"),energy=CanonicalRecipeCalculator.nullableNumber(scaled.path("nutrition").path("perServing"),"energyKcal");d.setCookMinutes(minutes==null?null:minutes.setScale(0,RoundingMode.CEILING).intValue());d.setCookTime(minutes==null?null:d.getCookMinutes()+"分钟");d.setCuisineCode(r.path("cuisineCode").asText(null));d.setKcal(energy==null?null:energy.setScale(0,RoundingMode.HALF_UP).intValue());
  List<String> names=new ArrayList<>(),amounts=new ArrayList<>();for(JsonNode i:scaled.path("ingredients")){if(!i.path("enabled").asBoolean())continue;String amount=i.hasNonNull("quantity")?i.path("quantity").decimalValue().stripTrailingZeros().toPlainString():"适量";names.add(i.path("name").asText());amounts.add(i.path("name").asText()+"|"+amount+"|"+(i.hasNonNull("quantity")?i.path("unit").asText():"")+"|"+i.path("role").asText()+"|"+i.path("preparation").asText());}d.setCl(String.join("、",names));d.setIngredientsAmounts(String.join("\n",amounts));if(completeProjection){List<String> steps=new ArrayList<>();for(JsonNode step:scaled.path("steps"))steps.add(step.path("text").asText());String text=String.join("\n",steps);d.setStep(text);d.setSteps(text);}else{d.setStep(null);d.setSteps(null);}
 }
}
