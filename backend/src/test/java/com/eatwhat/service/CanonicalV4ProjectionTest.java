package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.CanonicalCatalogMapper;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CanonicalV4ProjectionTest {
 @Test void runtimeMetadataCannotRelabelAnOldQuantityContract() throws Exception {
  for(String metadata:Arrays.asList("{}","{\"catalogContractVersion\":2,\"quantityPolicy\":\"fixed-recipe-v1\"}","{\"catalogContractVersion\":4}","{\"catalogContractVersion\":4,\"quantityPolicy\":\"linear\"}")){
   CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);when(mapper.metadata()).thenReturn(metadata);CanonicalCatalogService service=new CanonicalCatalogService(mapper,JSON);assertThrows(IllegalStateException.class,service::metadata);
  }
 }
 @Test void runtimeRecipeCannotCarryLegacyScalingRules() throws Exception {
  CanonicalRecipeCalculator calculator=new CanonicalRecipeCalculator();ObjectNode r=recipe();r.putObject("scaling").put("policy","SPLIT_EXCESS_INTO_BATCHES");assertThrows(IllegalArgumentException.class,()->calculator.calculate(r,CanonicalV4CalculationTest.definitions(),null));r.remove("scaling");((ObjectNode)r.path("ingredients").get(0)).putObject("scaleRule").put("type","linear");assertThrows(IllegalArgumentException.class,()->calculator.calculate(r,CanonicalV4CalculationTest.definitions(),null));
 }
 @Test void authoringAndCanonicalVersionPreserveExactDecimalQuantities() throws Exception {
  java.math.BigDecimal exact=new java.math.BigDecimal("0.666666666666666666666666666666666667");ObjectNode r=recipe();((ObjectNode)r.path("ingredients").get(0)).put("quantity",exact);
  Dish incoming=JSON.readValue("{\"recipe\":"+r+"}",com.eatwhat.dto.DishWriteRequest.class);assertEquals(0,exact.compareTo(incoming.getRecipe().path("ingredients").get(0).path("quantity").decimalValue()));service().prepareWrite(incoming);assertEquals(0,exact.compareTo(incoming.getScaledRecipe().path("ingredients").get(0).path("quantity").decimalValue()));
  Dish next=new Dish();ObjectNode changed=r.deepCopy();((ObjectNode)changed.path("ingredients").get(0)).put("quantity",exact.add(new java.math.BigDecimal("0.000000000000000000000000000000000001")));next.setRecipe(changed);Dish original=new Dish();original.setRecipe(r);assertNotEquals(original.getContentVersion(),next.getContentVersion());
  Dish equivalent=new Dish();equivalent.setRecipeJson(original.getRecipeJson().replace(exact.toPlainString(),exact.toPlainString()+"00"));assertEquals(original.getContentVersion(),equivalent.getContentVersion());
 }
 static final ObjectMapper JSON=new ObjectMapper();
 CanonicalCatalogService service() throws Exception {
  CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);when(mapper.metadata()).thenReturn("{\"catalogContractVersion\":4,\"quantityPolicy\":\"fixed-recipe-v1\",\"catalogRevision\":\"v4-test\",\"nutritionRuleVersion\":\"v4\",\"taxonomy\":{\"entries\":{\"CAT_VEGETABLE\":{\"dimension\":\"category\"},\"MEAL_LUNCH\":{\"dimension\":\"meal\"}}}}");
  Map<String,JsonNode> defs=CanonicalV4CalculationTest.definitions();((ObjectNode)defs.get("a")).putObject("compositionSource").put("archive","PRIVATE_ARCHIVE");when(mapper.ingredients(anyCollection())).thenAnswer(c->{List<String> out=new ArrayList<>();for(Object id:(Collection<?>)c.getArgument(0))out.add(defs.get(id).toString());return out;});return new CanonicalCatalogService(mapper,JSON);
 }
 ObjectNode recipe() throws Exception {ObjectNode r=CanonicalV4CalculationTest.recipe();r.put("categoryCode","CAT_VEGETABLE");r.putArray("mealCodes").add("MEAL_LUNCH");r.putObject("timing").putNull("activeMinutes").putNull("waitMinutes").putNull("totalMinutes");return r;}
 @Test void nullableFactsRenderWithoutZerosAndSourceMetadataDoesNotEscape() throws Exception {
  ObjectNode r=recipe();ObjectNode line=(ObjectNode)r.path("ingredients").get(0);line.putNull("quantity");line.put("quantityKind","discretionary");line.put("quantityDisplay","适量");r.putObject("provenance").put("privateNote","PRIVATE_PROVENANCE");Dish dish=new Dish();dish.setId(1L);dish.setRecipe(r);String stored=dish.getRecipeJson();service().enrich(dish);
  assertNull(dish.getKcal());assertNull(dish.getCookMinutes());assertNull(dish.getCookTime());assertEquals(stored,dish.getRecipeJson());String rendered=JSON.writeValueAsString(dish);assertFalse(rendered.contains("PRIVATE_"));assertFalse(rendered.contains("{{amount:"));assertFalse(rendered.contains("quantifiedSubtotal"));
 }
 @Test void candidateFactsKeepVersionAndRecipeButDiscardDuplicateCalculationBody() throws Exception {
  Dish dish=new Dish();dish.setId(1L);dish.setRecipe(recipe());CanonicalCatalogService catalog=service();String version=dish.getContentVersion(),source=dish.getRecipeJson();
  catalog.attachFacts(Collections.singletonList(dish));JsonNode facts=dish.getRecipe().deepCopy();
  assertNull(dish.getScaledRecipe());assertNull(dish.getStep());assertNull(dish.getSteps());
  assertTrue(facts.path("ingredients").get(0).path("ingredient").isObject());assertFalse(facts.has("calculatedNutrition"));assertFalse(facts.has("steps"));
  assertEquals(source,dish.getRecipeJson());assertEquals(version,dish.getContentVersion());
  catalog.enrich(dish);assertNotNull(dish.getScaledRecipe());assertNotNull(dish.getSteps());assertTrue(dish.getRecipe().path("calculatedNutrition").isObject());assertTrue(dish.getRecipe().path("steps").isArray());
  for(String key:Arrays.asList("id","dishGroupId","categoryCode","mealCodes","timing","allergenCodes","dietaryCodes","compositionCodes"))assertEquals(facts.path(key),dish.getRecipe().path(key));
  assertEquals(facts.path("ingredients").get(0).path("ingredient").path("name"),dish.getRecipe().path("ingredients").get(0).path("ingredient").path("name"));assertEquals(version,dish.getContentVersion());
 }
 @Test void authoringAllowsUnknownTimeAndBatchSize() throws Exception {
  ObjectNode r=recipe();r.putNull("baseServings");r.put("servingBasis","recipe_batch");r.putObject("scaling").put("available",false);((ObjectNode)r.path("ingredients").get(0)).putObject("scaleRule").put("type","linear");Dish dish=new Dish();dish.setRecipe(r);service().prepareWrite(dish);assertTrue(dish.getRecipe().path("calculatedNutrition").path("perServing").isNull());assertNull(dish.getFl());assertNull(dish.getCookMinutes());assertFalse(dish.getRecipe().has("scaling"));assertFalse(dish.getRecipe().path("ingredients").get(0).has("scaleRule"));assertEquals("fixed-recipe-v1",dish.getQuantityPolicy());
 }
 @Test void unknownAllergensAreNeverProvenAbsentInAssistantFilters(){Dish dish=CanonicalAssistantFixture.enrich(AssistantReadToolTest.Fixture.dish(1,"菜"));((ObjectNode)dish.getRecipe()).putNull("allergenCodes");assertFalse(CanonicalAssistantFacts.additional(dish,Collections.singletonMap("excluded_allergen_codes",Collections.singletonList("ALLERGEN_SOY"))));assertNull(CanonicalAssistantFacts.summary(dish).get("allergenCodes"));}
 @Test void shoppingUsesNullForUnknownProcurementAndAllowsOriginalBatch() throws Exception {
  ObjectNode r=recipe();ObjectNode line=(ObjectNode)r.path("ingredients").get(0);line.putNull("quantity");line.put("quantityKind","discretionary");line.put("quantityDisplay","适量");Dish dish=new Dish();dish.setId(1L);dish.setRecipe(r);DishQueryService dishes=mock(DishQueryService.class);when(dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Collections.singletonList(dish));ShoppingPreviewService preview=new ShoppingPreviewService(dishes,null,null);org.springframework.test.util.ReflectionTestUtils.setField(preview,"catalog",service());com.eatwhat.dto.ShoppingPreviewRequest request=new com.eatwhat.dto.ShoppingPreviewRequest();request.setDishIds(Collections.singletonList(1L));request.setTargetPeople(java.math.BigDecimal.ONE);
  com.eatwhat.dto.ShoppingPreviewItemDTO item=preview.createPreview(7L,request).getDishes().get(0).getItems().get(0);assertNull(item.getQuantityValue());assertEquals("",item.getQuantityText());
  r.putNull("baseServings");r.put("servingBasis","recipe_batch");dish.setRecipe(r);assertEquals(java.math.BigDecimal.ONE,preview.createPreview(7L,request).getDishes().get(0).getTargetPeople());request.setTargetPeople(null);com.eatwhat.dto.ShoppingDishDTO group=preview.createPreview(7L,request).getDishes().get(0);assertNull(group.getTargetPeople());assertNull(group.getItems().get(0).getSourceBasePeople());
 }
 @Test void recommendationUsesExactIngredientIdentityAndDefaultSelection(){Dish dish=CanonicalAssistantFixture.enrich(AssistantReadToolTest.Fixture.dish(1,"鱼香玉米淀粉"));ObjectNode line=(ObjectNode)dish.getRecipe().path("ingredients").get(0),definition=(ObjectNode)line.path("ingredient");definition.put("name","玉米淀粉");definition.putArray("aliases").add("生粉");assertFalse(CanonicalRecommendationFacts.excludes(dish,Collections.singletonList("玉米")));assertFalse(CanonicalRecommendationFacts.excludes(dish,Collections.singletonList("鱼")));assertTrue(CanonicalRecommendationFacts.excludes(dish,Collections.singletonList("生粉")));line.put("optional",true);line.put("defaultEnabled",false);assertFalse(CanonicalRecommendationFacts.excludes(dish,Collections.singletonList("生粉")));}
 @Test void missingProcurementConversionDoesNotRewriteExactRecipeQuantity() throws Exception {
  Dish dish=new Dish();dish.setId(1L);dish.setRecipe(recipe());Map<String,JsonNode> defs=CanonicalV4CalculationTest.definitions();ObjectNode definition=(ObjectNode)defs.get("a");definition.put("definitionKnowledge","identity_only");definition.putNull("procurementYield");JsonNode scaled=new CanonicalRecipeCalculator().calculate(dish.getRecipe(),defs,java.math.BigDecimal.ONE);
  DishQueryService dishes=mock(DishQueryService.class);when(dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Collections.singletonList(dish));CanonicalCatalogService catalog=mock(CanonicalCatalogService.class);when(catalog.scale(dish,java.math.BigDecimal.ONE)).thenReturn((ObjectNode)scaled);ShoppingPreviewService preview=new ShoppingPreviewService(dishes,null,null);org.springframework.test.util.ReflectionTestUtils.setField(preview,"catalog",catalog);com.eatwhat.dto.ShoppingPreviewRequest request=new com.eatwhat.dto.ShoppingPreviewRequest();request.setDishIds(Collections.singletonList(1L));request.setTargetPeople(java.math.BigDecimal.ONE);com.eatwhat.dto.ShoppingPreviewItemDTO item=preview.createPreview(7L,request).getDishes().get(0).getItems().get(0);assertEquals("EXACT",item.getQuantityKind());assertNull(item.getQuantityValue());assertEquals("",item.getQuantityText());
 }
}
