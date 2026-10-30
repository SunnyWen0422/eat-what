package com.eatwhat.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class MainIngredientNutritionTest {
 @Test void unknownAndKnownSeasoningsAndSupportDoNotAffectNutritionButRemainInRecipe() throws Exception {
  for(String role:Arrays.asList("seasoning","support"))for(boolean unknown:Arrays.asList(false,true)){
   ObjectNode recipe=CanonicalV4CalculationTest.recipe();ObjectNode line=((ObjectNode)recipe.path("ingredients").get(0)).deepCopy();line.put("id","i2").put("ingredientId","b").put("role",role);
   Map<String,JsonNode> definitions=CanonicalV4CalculationTest.definitions();ObjectNode seasoning=definitions.get("a").deepCopy();seasoning.put("id","b");seasoning.putArray("allergens").add("soy");
   if(unknown){line.putNull("quantity").put("quantityKind","discretionary").put("quantityDisplay","适量").put("nutritionContribution","unknown");seasoning.put("definitionKnowledge","identity_only").putNull("nutritionPer100g").putNull("gramsPerUnit");}
   definitions.put("b",seasoning);((ArrayNode)recipe.path("ingredients")).add(line);((ObjectNode)recipe.path("steps").get(0)).put("text","加入{{amount:i1}}和{{amount:i2}}");String before=recipe.toString();
   JsonNode result=new CanonicalRecipeCalculator().calculate(recipe,definitions,new BigDecimal("2"));JsonNode nutrition=result.path("nutrition");
   assertEquals("complete",nutrition.path("completeness").asText());assertEquals(10,nutrition.path("total").path("energyKcal").asInt());assertEquals(5,nutrition.path("perServing").path("energyKcal").asInt());
   assertEquals(CanonicalRecipeCalculator.NUTRITION_SCOPE,nutrition.path("scope").asText());assertEquals(CanonicalRecipeCalculator.RULE_VERSION,nutrition.path("ruleVersion").asText());assertEquals(0,nutrition.path("unknownReasons").size());
   assertEquals(2,result.path("ingredients").size());assertTrue(result.path("allergenCodes").toString().contains("ALLERGEN_SOY"));assertEquals(before,recipe.toString());
   assertTrue(result.path("steps").get(0).path("text").asText().contains(unknown?"适量":"100克"));
  }
 }
 @Test void noEnabledMainNeverClaimsZeroComplete() throws Exception {
  ObjectNode recipe=CanonicalV4CalculationTest.recipe();ObjectNode line=(ObjectNode)recipe.path("ingredients").get(0);
  for(String role:Arrays.asList("seasoning","support","")){
   line.put("role",role);JsonNode n=new CanonicalRecipeCalculator().calculate(recipe,CanonicalV4CalculationTest.definitions(),null).path("nutrition");
   assertEquals("partial",n.path("completeness").asText());assertTrue(n.path("total").isNull());assertEquals("no_enabled_main_ingredients",n.path("unavailableReason").asText());
  }
  line.put("role","main").put("optional",true).put("defaultEnabled",false);
  assertTrue(new CanonicalRecipeCalculator().calculate(recipe,CanonicalV4CalculationTest.definitions(),null).path("nutrition").path("total").isNull());
 }
 @Test void mainUnknownStillBlocksTotal() throws Exception {
  ObjectNode recipe=CanonicalV4CalculationTest.recipe();((ObjectNode)recipe.path("ingredients").get(0)).putNull("quantity").put("quantityKind","discretionary").put("quantityDisplay","适量");
  JsonNode n=new CanonicalRecipeCalculator().calculate(recipe,CanonicalV4CalculationTest.definitions(),null).path("nutrition");assertTrue(n.path("total").isNull());assertEquals("quantity",n.path("unknownReasons").get(0).path("reason").asText());
 }
}
