package com.eatwhat.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.math.*;
import java.util.*;
import java.util.regex.*;

/** The one quantity/nutrition calculation contract. Display prose is never numeric input. */
public final class CanonicalRecipeCalculator {
 private static final ObjectMapper JSON=new ObjectMapper();
 private static final MathContext MC=new MathContext(36,RoundingMode.HALF_EVEN);
 public static final List<String> NUTRIENTS=Arrays.asList("energyKcal","proteinG","fatG","carbohydrateG","fiberG","sodiumMg");
 private static final Set<String> FOOD_GROUPS=new HashSet<>(Arrays.asList("meat","poultry","fish","seafood","egg","dairy","soy","vegetable","mushroom","grain","fruit","nut"));
 public ObjectNode calculate(JsonNode recipe,Map<String,JsonNode> standards,BigDecimal servings) {
  return calculate(recipe,standards,servings,Collections.emptyMap());
 }
 public ObjectNode calculate(JsonNode recipe,Map<String,JsonNode> standards,BigDecimal servings,Map<String,Boolean> overrides) {
  if(recipe.has("scaling")||recipe.has("quantityPolicy")&&!"fixed-recipe-v1".equals(recipe.path("quantityPolicy").asText()))throw invalid("fixed-recipe policy required");
  BigDecimal base=nullableNumber(recipe,"baseServings"),diners=servings;
  if(base!=null)positive(base,"baseServings");
  if(diners!=null){positive(diners,"diners");if(diners.compareTo(new BigDecimal("50"))>0)throw invalid("diners exceeds 50");}
  Map<String,JsonNode> lines=new LinkedHashMap<>();Map<String,Boolean> enabled=new LinkedHashMap<>();
  if(!recipe.path("ingredients").isArray()||recipe.path("ingredients").size()==0||recipe.path("ingredients").size()>500)throw invalid("ingredients");
  for(JsonNode line:recipe.path("ingredients")){if(line.has("scaleRule"))throw invalid("legacy scale rule is not a runtime fact");String id=text(line,"id");if(lines.put(id,line)!=null)throw invalid("duplicate ingredient line");}
  if(overrides==null)overrides=Collections.emptyMap();if(!lines.keySet().containsAll(overrides.keySet()))throw invalid("unknown optional override");
  for(Map.Entry<String,JsonNode> entry:lines.entrySet()){
   JsonNode line=entry.getValue(),standard=standards.get(text(line,"ingredientId"));if(standard==null)throw invalid("missing ingredient");
   if(!text(line,"unit").equals(text(standard,"unit")))throw invalid("ingredient unit mismatch");
   if(!line.path("optional").isBoolean()||!line.path("defaultEnabled").isBoolean())throw invalid("enabled flags must be boolean");
   Boolean flag=overrides.containsKey(entry.getKey())?overrides.get(entry.getKey()):line.path("defaultEnabled").asBoolean();
   if(flag==null||!line.path("optional").asBoolean()&&!flag)throw invalid("required ingredient cannot be disabled");enabled.put(entry.getKey(),flag);
   String kind=line.path("quantityKind").asText("exact");
   if("discretionary".equals(kind)){
    if(!line.path("quantity").isNull()||!"适量".equals(line.path("quantityDisplay").asText()))throw invalid("discretionary requires null quantity and 适量");
   }else if("exact".equals(kind))positive(number(line,"quantity"),"quantity");else throw invalid("quantity kind");
   if(line.hasNonNull("nutritionContribution")&&!"unknown".equals(line.path("nutritionContribution").asText()))throw invalid("nutrition contribution");
  }
  Map<String,BigDecimal> totals=new LinkedHashMap<>();
  for(Map.Entry<String,JsonNode> entry:lines.entrySet()){
   JsonNode line=entry.getValue();BigDecimal quantity=!enabled.get(entry.getKey())?BigDecimal.ZERO:nullableNumber(line,"quantity");
   totals.put(entry.getKey(),quantity==null?null:plain(quantity));
  }
  ObjectNode result=JSON.createObjectNode();result.set("recipeId",recipe.path("id"));put(result,"servings",diners);put(result,"diners",diners);put(result,"baseServings",base);result.put("quantityPolicy","fixed-recipe-v1");result.put("quantityBasis","fixed_recipe");result.put("portionBasis","equal_share_reference");result.put("catalogContractVersion",4);
  ArrayNode output=result.putArray("ingredients"),unknownReasons=JSON.createArrayNode();Set<String> unknownLines=new LinkedHashSet<>();Map<String,BigDecimal> nutrients=new LinkedHashMap<>();NUTRIENTS.forEach(n->nutrients.put(n,BigDecimal.ZERO));
  for(Map.Entry<String,JsonNode> entry:lines.entrySet()){
   String id=entry.getKey();JsonNode line=entry.getValue(),standard=standards.get(line.path("ingredientId").asText());boolean identity="identity_only".equals(standard.path("definitionKnowledge").asText());
   BigDecimal conversion=nullableNumber(standard,"gramsPerUnit"),yield=nullableNumber(standard,"procurementYield");
   if(conversion==null&&!identity||yield==null&&!identity)throw invalid("unknown conversion requires identity_only");
   if(conversion!=null)positive(conversion,"gramsPerUnit");if(yield!=null){positive(yield,"procurementYield");if(yield.compareTo(BigDecimal.ONE)>0)throw invalid("procurementYield exceeds 1");}
   JsonNode facts=standard.path("nutritionPer100g");if(!facts.isObject()&&!identity)throw invalid("unknown nutrition requires identity_only");
   BigDecimal q=totals.get(id);boolean zero=q!=null&&q.signum()==0;BigDecimal grams=zero?BigDecimal.ZERO:q==null||conversion==null?null:q.multiply(conversion,MC);BigDecimal procurement=zero?BigDecimal.ZERO:q==null||yield==null?null:q.divide(yield,MC);
   ObjectNode row=output.addObject();row.put("lineId",id);row.put("ingredientId",line.path("ingredientId").asText());row.put("name",text(standard,"name"));put(row,"quantity",q);row.put("quantityKind",line.path("quantityKind").asText("exact"));row.put("quantityDisplay",q==null?"适量":display(q,line.path("unit").asText()));row.put("unit",line.path("unit").asText());put(row,"grams",grams);put(row,"procurementQuantity",procurement);row.put("preparation",line.path("preparation").asText());row.put("role",line.path("role").asText());row.put("optional",line.path("optional").asBoolean());row.put("enabled",enabled.get(id));row.set("ingredient",standard);
   boolean unknownRetention="unknown".equals(line.path("nutritionContribution").asText());
   if(!zero){if(q==null)unknown(unknownReasons,unknownLines,id,"quantity");if(conversion==null)unknown(unknownReasons,unknownLines,id,"unitMass");if(!facts.isObject())unknown(unknownReasons,unknownLines,id,"ingredientNutrition");if(unknownRetention)unknown(unknownReasons,unknownLines,id,"processRetention");}
   JsonNode retention=line.path("nutrientRetention");if(!retention.isMissingNode()&&!retention.isObject())throw invalid("retention must be object");Iterator<String> retained=retention.fieldNames();while(retained.hasNext())if(!NUTRIENTS.contains(retained.next()))throw invalid("unknown retention nutrient");
   for(String n:NUTRIENTS){BigDecimal factor=retention.has(n)?number(retention,n):BigDecimal.ONE;if(factor.signum()<0||factor.compareTo(BigDecimal.ONE)>0)throw invalid("retention");BigDecimal per100=facts.isObject()?number(facts,n):null;if(per100!=null&&per100.signum()<0)throw invalid("negative nutrition");if(grams!=null&&per100!=null&&!unknownRetention)nutrients.put(n,nutrients.get(n).add(grams.multiply(per100,MC).divide(new BigDecimal("100"),MC).multiply(factor,MC),MC));}
  }
  result.set("steps",steps(recipe,lines,totals));
  ObjectNode nutrition=result.putObject("nutrition");nutrition.put("completeness",unknownLines.isEmpty()?"complete":"partial");nutrition.set("unknownLineIds",JSON.valueToTree(unknownLines));nutrition.set("unknownReasons",unknownReasons);
  ObjectNode subtotal=nutrition.putObject("quantifiedSubtotal"),total=JSON.createObjectNode(),per=JSON.createObjectNode();for(String n:NUTRIENTS){BigDecimal value=nutrients.get(n);total.put(n,round(value));if(diners!=null)per.put(n,round(value.divide(diners,MC)));}subtotal.set("total",total);subtotal.set("perServing",diners==null?NullNode.instance:per);
  nutrition.set("total",unknownLines.isEmpty()?total.deepCopy():NullNode.instance);nutrition.set("perServing",unknownLines.isEmpty()&&diners!=null?per.deepCopy():NullNode.instance);if(diners==null)nutrition.put("perServingUnavailableReason","diners_not_specified");
  ObjectNode tags=deriveTags(lines,enabled,standards);result.setAll(tags);return result;
 }
 private ArrayNode steps(JsonNode recipe,Map<String,JsonNode> lines,Map<String,BigDecimal> quantities){
  if(!recipe.path("steps").isArray()||recipe.path("steps").size()==0)throw invalid("steps");ArrayNode out=JSON.createArrayNode();Set<String> seen=new HashSet<>();
  for(JsonNode step:recipe.path("steps")){
   String id=text(step,"id");if(!seen.add(id))throw invalid("duplicate step");ObjectNode item=step.deepCopy();item.put("text",render(text(step,"text"),lines,quantities));item.remove("batchIndex");ObjectNode allocations=item.putObject("ingredientQuantities");
   for(JsonNode ref:step.path("ingredientLineIds"))if(!lines.containsKey(ref.asText()))throw invalid("step ingredient reference");
   for(JsonNode allocation:step.path("ingredientAllocations")){String ref=text(allocation,"ingredientLineId");if(!lines.containsKey(ref))throw invalid("allocation ingredient reference");BigDecimal fraction=number(allocation,"fraction");if(fraction.signum()<=0||fraction.compareTo(BigDecimal.ONE)>0)throw invalid("allocation fraction");BigDecimal q=quantities.get(ref);put(allocations,ref,q==null?null:q.multiply(fraction,MC));}out.add(item);
  }return out;
 }
 private String render(String value,Map<String,JsonNode> lines,Map<String,BigDecimal> quantities){
  Matcher matcher=Pattern.compile("\\{\\{amount:([^{}]+)\\}\\}").matcher(value);StringBuffer out=new StringBuffer();while(matcher.find()){String id=matcher.group(1);if(!lines.containsKey(id))throw invalid("step amount reference");matcher.appendReplacement(out,Matcher.quoteReplacement(display(quantities.get(id),lines.get(id).path("unit").asText())));}matcher.appendTail(out);if(out.indexOf("{{amount:")>=0)throw invalid("step amount token");return out.toString();
 }
 private String display(BigDecimal q,String unit){if(q==null)return "适量";if(q.signum()==0)return "不添加";return q.setScale(2,RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()+("g".equals(unit)?"克":"ml".equals(unit)?"毫升":"piece".equals(unit)?"个":unit);}
 private ObjectNode deriveTags(Map<String,JsonNode> lines,Map<String,Boolean> enabled,Map<String,JsonNode> standards){
  Set<String> allergens=new TreeSet<>(),origins=new TreeSet<>(),groups=new TreeSet<>();boolean unknownAllergens=false,unknownOrigins=false;Map<String,Safety> memo=new HashMap<>();
  for(Map.Entry<String,JsonNode> entry:lines.entrySet()){if(!enabled.get(entry.getKey()))continue;String id=entry.getValue().path("ingredientId").asText();JsonNode ing=standards.get(id);Safety facts=safety(id,standards,memo,new HashSet<>());unknownAllergens|=facts.unknownAllergens;unknownOrigins|=facts.unknownOrigins;allergens.addAll(facts.allergens);origins.addAll(facts.origins);String group=ing.path("group").asText();if(FOOD_GROUPS.contains(group))groups.add("COMPOSITION_"+group.toUpperCase(Locale.ROOT));}
  ObjectNode out=JSON.createObjectNode();ArrayNode ac=JSON.createArrayNode();for(String a:allergens)ac.add("ALLERGEN_"+a.toUpperCase(Locale.ROOT));out.set("allergenCodes",unknownAllergens?NullNode.instance:ac);ArrayNode dc=JSON.createArrayNode();if(origins.isEmpty())dc.add("DIET_VEGAN");else if(new HashSet<>(Arrays.asList("egg","dairy","honey")).containsAll(origins))dc.add("DIET_OVO_LACTO");out.set("dietaryCodes",unknownOrigins?NullNode.instance:dc);out.set("compositionCodes",JSON.valueToTree(groups));return out;
 }
 private Safety safety(String id,Map<String,JsonNode> standards,Map<String,Safety> memo,Set<String> active){
  if(memo.containsKey(id))return memo.get(id);if(!active.add(id))throw invalid("constituent cycle");JsonNode ing=standards.get(id);if(ing==null)throw invalid("missing constituent "+id);Safety out=new Safety();out.unknownAllergens=!ing.path("allergens").isArray();out.unknownOrigins=!ing.path("animalOrigins").isArray()||!ing.path("animal").isBoolean();for(JsonNode a:ing.path("allergens"))out.allergens.add(a.asText());for(JsonNode o:ing.path("animalOrigins"))out.origins.add(o.asText());
  for(JsonNode child:ing.path("compositionSource").path("constituents")){Safety facts=safety(text(child,"ingredientId"),standards,memo,active);out.unknownAllergens|=facts.unknownAllergens;out.unknownOrigins|=facts.unknownOrigins;out.allergens.addAll(facts.allergens);out.origins.addAll(facts.origins);}
  if(ing.path("animal").asBoolean()&&!out.unknownOrigins&&out.origins.isEmpty())throw invalid("animal ingredient lacks origin");active.remove(id);memo.put(id,out);return out;
 }
 private static final class Safety {boolean unknownAllergens,unknownOrigins;Set<String> allergens=new TreeSet<>(),origins=new TreeSet<>();}
 private void unknown(ArrayNode reasons,Set<String> lines,String id,String reason){lines.add(id);reasons.addObject().put("lineId",id).put("reason",reason);}
 private static BigDecimal plain(BigDecimal value){BigDecimal normalized=value.stripTrailingZeros();return normalized.scale()<0?normalized.setScale(0):normalized;}
 private static BigDecimal round(BigDecimal value){return plain(value.setScale(12,RoundingMode.HALF_UP));}
 private static void put(ObjectNode node,String key,BigDecimal value){if(value==null)node.putNull(key);else node.put(key,value);}
 public static BigDecimal nullableNumber(JsonNode node,String key){return !node.hasNonNull(key)?null:number(node,key);}
 public static BigDecimal number(JsonNode n,String key){JsonNode value=n.get(key);if(value==null||!value.isNumber())throw invalid(key+" must be a number");return value.decimalValue();}
 public static String text(JsonNode n,String key){JsonNode value=n.get(key);if(value==null||!value.isTextual()||value.asText().trim().isEmpty())throw invalid(key+" is required");return value.asText();}
 private static void positive(BigDecimal n,String key){if(n==null||n.signum()<=0||n.compareTo(new BigDecimal("10000000"))>0)throw invalid(key+" out of range");}
 private static IllegalArgumentException invalid(String reason){return new IllegalArgumentException("Canonical recipe: "+reason);}
}
