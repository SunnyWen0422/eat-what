package com.eatwhat.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class CanonicalV4CalculationTest {
 @Test void fixedRecipeUsesDinersOnlyForEqualShareReference() throws Exception {
  ObjectNode r=recipe();r.remove("scaling");r.put("quantityPolicy","fixed-recipe-v1");((ObjectNode)r.path("ingredients").get(0)).remove("scaleRule");
  CanonicalRecipeCalculator calculator=new CanonicalRecipeCalculator();
  for(boolean unknownBase:Arrays.asList(false,true)){
   if(unknownBase)r.putNull("baseServings");
   for(BigDecimal diners:Arrays.asList(null,BigDecimal.ONE,new BigDecimal("2"),new BigDecimal("5"))){
    JsonNode out=calculator.calculate(r,definitions(),diners);
    assertEquals("fixed-recipe-v1",out.path("quantityPolicy").asText());assertEquals("fixed_recipe",out.path("quantityBasis").asText());assertEquals("equal_share_reference",out.path("portionBasis").asText());
    assertEquals(100,out.path("ingredients").get(0).path("quantity").intValue());assertEquals(100,out.path("ingredients").get(0).path("procurementQuantity").intValue());assertEquals(10,out.path("nutrition").path("total").path("energyKcal").intValue());assertEquals("加入100克，180℃加热5分钟",out.path("steps").get(0).path("text").asText());assertFalse(out.has("batches"));
    if(diners==null){assertTrue(out.path("diners").isNull());assertTrue(out.path("nutrition").path("perServing").isNull());assertEquals("diners_not_specified",out.path("nutrition").path("perServingUnavailableReason").asText());}
    else {assertEquals(0,diners.compareTo(out.path("diners").decimalValue()));assertEquals(0,new BigDecimal("10").divide(diners).compareTo(out.path("nutrition").path("perServing").path("energyKcal").decimalValue()));}
   }
  }
 }
 static final ObjectMapper JSON=new ObjectMapper();
 static ObjectNode recipe() throws Exception {
  ObjectNode fixed=(ObjectNode)JSON.readTree("{\"id\":1,\"name\":\"测试菜\",\"baseServings\":2,\"scaling\":{\"policy\":\"SPLIT_EXCESS_INTO_BATCHES\",\"maxServingsPerBatch\":2},\"ingredients\":[{\"id\":\"i1\",\"ingredientId\":\"a\",\"quantity\":100,\"quantityKind\":\"exact\",\"unit\":\"g\",\"optional\":false,\"defaultEnabled\":true,\"role\":\"main\",\"scaleRule\":{\"type\":\"linear\"}}],\"steps\":[{\"id\":\"s1\",\"text\":\"加入{{amount:i1}}，180℃加热5分钟\",\"activeMinutes\":null,\"waitMinutes\":null,\"dependsOn\":[],\"ingredientLineIds\":[\"i1\"]}]}" );
  fixed.remove("scaling");for(JsonNode line:fixed.path("ingredients"))((ObjectNode)line).remove("scaleRule");return fixed;
 }
 static Map<String,JsonNode> definitions() throws Exception {
  JsonNode a=JSON.readTree("{\"id\":\"a\",\"name\":\"青菜\",\"unit\":\"g\",\"gramsPerUnit\":1,\"procurementYield\":1,\"group\":\"vegetable\",\"animal\":false,\"animalOrigins\":[],\"allergens\":[],\"nutritionPer100g\":{\"energyKcal\":10,\"proteinG\":1,\"fatG\":0,\"carbohydrateG\":1,\"fiberG\":1,\"sodiumMg\":1}}");
  Map<String,JsonNode> out=new LinkedHashMap<>();out.put("a",a);return out;
 }
 @Test void discretionaryQuantityIsNotZeroOrWholeRecipeNutrition() throws Exception {
  ObjectNode r=recipe();ObjectNode line=(ObjectNode)r.path("ingredients").get(0);line.putNull("quantity");line.put("quantityKind","discretionary");line.put("quantityDisplay","适量");
  JsonNode out=new CanonicalRecipeCalculator().calculate(r,definitions(),BigDecimal.ONE);
  assertTrue(out.path("ingredients").get(0).path("quantity").isNull());assertTrue(out.path("ingredients").get(0).path("procurementQuantity").isNull());
  assertEquals("partial",out.path("nutrition").path("completeness").asText());assertTrue(out.path("nutrition").path("total").isNull());assertTrue(out.path("nutrition").path("perServing").isNull());assertTrue(out.path("steps").get(0).path("text").asText().contains("适量"));
 }
 @Test void unknownBaseSupportsFixedRecipeAndExplicitDiners() throws Exception {
  ObjectNode r=recipe();r.putNull("baseServings");r.put("servingBasis","recipe_batch");
  JsonNode out=new CanonicalRecipeCalculator().calculate(r,definitions(),null);
  assertTrue(out.path("servings").isNull());assertEquals(100,out.path("ingredients").get(0).path("quantity").intValue());assertEquals("complete",out.path("nutrition").path("completeness").asText());assertTrue(out.path("nutrition").path("perServing").isNull());
  assertEquals(10,new CanonicalRecipeCalculator().calculate(r,definitions(),BigDecimal.ONE).path("nutrition").path("perServing").path("energyKcal").intValue());
 }
 @Test void stepsAndIngredientsStayAtTheFixedRecipeAmounts() throws Exception {
  JsonNode out=new CanonicalRecipeCalculator().calculate(recipe(),definitions(),new BigDecimal("5"));
  assertFalse(out.has("batches"));assertEquals(1,out.path("steps").size());assertEquals("加入100克，180℃加热5分钟",out.path("steps").get(0).path("text").asText());
 }
 @Test void unknownRetentionAndIdentityOnlyKeepNutritionNull() throws Exception {
  ObjectNode r=recipe();((ObjectNode)r.path("ingredients").get(0)).put("nutritionContribution","unknown");JsonNode out=new CanonicalRecipeCalculator().calculate(r,definitions(),BigDecimal.ONE);assertTrue(out.path("nutrition").path("total").isNull());
  Map<String,JsonNode> defs=definitions();ObjectNode a=(ObjectNode)defs.get("a");a.put("definitionKnowledge","identity_only");a.putNull("gramsPerUnit");a.putNull("procurementYield");a.putNull("nutritionPer100g");a.putNull("allergens");a.putNull("animalOrigins");a.putNull("animal");
  out=new CanonicalRecipeCalculator().calculate(recipe(),defs,BigDecimal.ONE);assertTrue(out.path("ingredients").get(0).path("grams").isNull());assertTrue(out.path("dietaryCodes").isNull());assertTrue(out.path("allergenCodes").isNull());
 }
 @Test void optionalOverrideRecalculatesNutritionAndSafetyWithoutDisabledUnknowns() throws Exception {
  ObjectNode r=recipe();ObjectNode option=((ObjectNode)r.path("ingredients").get(0)).deepCopy();option.put("id","i2");option.put("ingredientId","b");option.put("optional",true);option.put("defaultEnabled",false);option.putNull("quantity");option.put("quantityKind","discretionary");option.put("quantityDisplay","适量");((ArrayNode)r.path("ingredients")).add(option);
  Map<String,JsonNode> defs=definitions();ObjectNode b=defs.get("a").deepCopy();b.put("id","b");b.put("definitionKnowledge","identity_only");b.putNull("allergens");b.putNull("animal");b.putNull("animalOrigins");defs.put("b",b);
  ((ObjectNode)r.path("steps").get(0)).put("text","调料{{amount:i2}}");CanonicalRecipeCalculator calc=new CanonicalRecipeCalculator();JsonNode off=calc.calculate(r,defs,BigDecimal.ONE);assertEquals("complete",off.path("nutrition").path("completeness").asText());assertEquals("DIET_VEGAN",off.path("dietaryCodes").get(0).asText());assertEquals("调料不添加",off.path("steps").get(0).path("text").asText());
  JsonNode on=calc.calculate(r,defs,BigDecimal.ONE,Collections.singletonMap("i2",true));assertEquals("partial",on.path("nutrition").path("completeness").asText());assertTrue(on.path("allergenCodes").isNull());assertTrue(on.path("dietaryCodes").isNull());assertThrows(IllegalArgumentException.class,()->calc.calculate(r,defs,BigDecimal.ONE,Collections.singletonMap("i1",false)));
 }
 @Test void legacyRulesCannotOverrideTheFixedRecipeQuantities() throws Exception {
  ObjectNode r=recipe();ObjectNode first=(ObjectNode)r.path("ingredients").get(0);first.put("quantity",1);first.putObject("scaleRule").put("type","ceil").put("step",1);ObjectNode linked=first.deepCopy();linked.put("id","i2");linked.putObject("scaleRule").put("type","linked").put("ingredientLineId","i1").put("ratio",4);((ArrayNode)r.path("ingredients")).add(linked);
  assertThrows(IllegalArgumentException.class,()->new CanonicalRecipeCalculator().calculate(r,definitions(),new BigDecimal("5")));
 }
}
