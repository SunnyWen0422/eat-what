package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.CanonicalCatalogMapper;
import com.eatwhat.controller.CanonicalCatalogController;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.math.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CanonicalCatalogContractTest {
 static final ObjectMapper JSON=new ObjectMapper();static JsonNode fixture;static Map<String,JsonNode> standards;
 @BeforeAll static void load() throws Exception {
  String path=System.getenv("EATWHAT_CANONICAL_FIXTURE");Assumptions.assumeTrue(path!=null,"Set EATWHAT_CANONICAL_FIXTURE to the canonical input file");fixture=JSON.readTree(Files.readAllBytes(Paths.get(path)));standards=new HashMap<>();for(JsonNode n:fixture.path("ingredients"))standards.put(n.path("id").asText(),n);
 }
 JsonNode recipe(long id){for(JsonNode r:fixture.path("recipes"))if(r.path("id").asLong()==id)return r.deepCopy();throw new IllegalArgumentException();}
 @Test void entireCatalogCalculatesFromIngredientCompositionWithoutLegacyText(){
  CanonicalRecipeCalculator calc=new CanonicalRecipeCalculator();assertEquals(4,fixture.path("catalogContractVersion").asInt());assertEquals("fixed-recipe-v1",fixture.path("quantityPolicy").asText());assertEquals(5407,fixture.path("recipes").size());assertEquals(1779,standards.size());
  for(JsonNode r:fixture.path("recipes")){
   JsonNode result=calc.calculate(r,standards,null);
   JsonNode cached=r.path("calculatedNutrition"),nutrition=result.path("nutrition");assertEquals(cached.path("completeness"),nutrition.path("completeness"),"completeness "+r.path("id"));
   for(String tag:Arrays.asList("allergenCodes","dietaryCodes","compositionCodes"))assertEquals(r.path(tag),result.path(tag),tag+" "+r.path("id"));
   for(String scope:Arrays.asList("total","perServing")){if(cached.path(scope).isNull())assertTrue(nutrition.path(scope).isNull(),scope+" "+r.path("id"));else for(String n:CanonicalRecipeCalculator.NUTRIENTS){BigDecimal expected=cached.path(scope).path(n).decimalValue();BigDecimal actual=nutrition.path(scope).path(n).decimalValue();assertTrue(expected.subtract(actual).abs().compareTo(new BigDecimal("0.000000001"))<0,"nutrition "+r.path("id")+" "+n+" "+expected+" != "+actual);}}
   assertEquals(r.path("ingredients").size(),result.path("ingredients").size());
   for(int diners:Arrays.asList(1,2,5)){JsonNode shared=calc.calculate(r,standards,BigDecimal.valueOf(diners));assertEquals(result.path("ingredients"),shared.path("ingredients"),"fixed ingredients "+r.path("id"));assertEquals(result.path("steps"),shared.path("steps"),"fixed steps "+r.path("id"));assertEquals(nutrition.path("total"),shared.path("nutrition").path("total"));if(nutrition.path("total").isNull())assertTrue(shared.path("nutrition").path("perServing").isNull());else for(String n:CanonicalRecipeCalculator.NUTRIENTS)assertTrue(shared.path("nutrition").path("perServing").path(n).decimalValue().multiply(BigDecimal.valueOf(diners)).subtract(nutrition.path("total").path(n).decimalValue()).abs().compareTo(new BigDecimal("0.000000001"))<0,"equal share "+r.path("id"));}
  }
 }
 @Test void everyEnabledLineUsesItsSourceQuantityEvenWhenTheRecipeHadLegacyRules(){
  CanonicalRecipeCalculator calc=new CanonicalRecipeCalculator();for(long id:Arrays.asList(1209L,188L)){JsonNode r=recipe(id);JsonNode fixed=calc.calculate(r,standards,new BigDecimal("5"));assertFalse(fixed.has("batches"));for(int i=0;i<r.path("ingredients").size();i++){JsonNode line=r.path("ingredients").get(i),actual=fixed.path("ingredients").get(i);if(!line.path("defaultEnabled").asBoolean()){assertEquals(0,actual.path("quantity").decimalValue().signum());continue;}if(line.path("quantity").isNull())assertTrue(actual.path("quantity").isNull());else assertEquals(0,line.path("quantity").decimalValue().compareTo(actual.path("quantity").decimalValue()));}}
 }
 @Test void stepTokensRenderOnlyExplicitReferencesAndPreserveTemperatureTime(){ObjectNode r=(ObjectNode)recipe(31);((ObjectNode)r.path("steps").get(0)).put("text","加入{{amount:i1}}豆腐，180℃加热5分钟");JsonNode out=new CanonicalRecipeCalculator().calculate(r,standards,new BigDecimal("3"));assertEquals("加入300克豆腐，180℃加热5分钟",out.path("steps").get(0).path("text").asText());}
 @Test void recommendationOptionsUseCanonicalTaxonomy(){CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);when(mapper.metadata()).thenReturn(fixture.toString());RecommendationMetadataService metadata=new RecommendationMetadataService(mock(com.eatwhat.mapper.DishMapper.class),mapper);assertTrue(metadata.isKnownCuisine("CUISINE_HOME_STYLE"));assertTrue(metadata.isKnownTag("FLAVOR_HOT"));assertTrue(metadata.isKnownTag("DIET_VEGAN"));assertFalse(metadata.isKnownTag("BREAKFAST"));assertFalse(metadata.isKnownCuisine("CHUAN"));}
 @Test void invalidReferencesUnitsAndCyclesFailClosed(){CanonicalRecipeCalculator calc=new CanonicalRecipeCalculator();ObjectNode r=(ObjectNode)recipe(31);((ObjectNode)r.path("ingredients").get(0)).put("unit","spoon");assertThrows(IllegalArgumentException.class,()->calc.calculate(r,standards,BigDecimal.ONE));ObjectNode badReference=(ObjectNode)recipe(1209);((ObjectNode)badReference.path("steps").get(0)).put("text","加入{{amount:missing}}");assertThrows(IllegalArgumentException.class,()->calc.calculate(badReference,standards,BigDecimal.ONE));}
 @Test void serializationKeepsCanonicalRecipeAndRevisionButNoQualityState() throws Exception {
  CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);when(mapper.metadata()).thenReturn(fixture.toString());when(mapper.ingredients(anyCollection())).thenAnswer(inv->{List<String> out=new ArrayList<>();for(Object id:(Collection<?>)inv.getArgument(0))out.add(standards.get(id).toString());return out;});CanonicalCatalogService catalog=new CanonicalCatalogService(mapper,JSON);Dish d=new Dish();d.setId(31L);d.setRecipeJson(recipe(31).toString());String version=d.getContentVersion();catalog.enrich(d);JsonNode output=JSON.readTree(JSON.writeValueAsString(d));assertFalse(output.path("recipe").path("ingredients").get(0).path("ingredient").has("nutritionPer100g"));assertFalse(output.toString().contains("compositionSource"));assertFalse(output.toString().contains("provenance"));assertFalse(output.toString().contains("quantifiedSubtotal"));assertFalse(output.has("quality"));assertFalse(output.has("recipeJson"));assertEquals(version,d.getContentVersion());assertEquals(version,output.path("contentVersion").asText());catalog.enrich(d);assertEquals(version,d.getContentVersion());assertEquals(300,catalog.scale(d,new BigDecimal("3")).path("ingredients").get(0).path("quantity").intValue());assertEquals(fixture.path("catalogRevision"),output.path("catalogRevision"));
 }
 @Test void internalScaleAuthenticatesAndScopesOwner(){CanonicalCatalogService catalog=mock(CanonicalCatalogService.class);DishQueryService dishes=mock(DishQueryService.class);CanonicalCatalogController c=new CanonicalCatalogController(catalog,dishes,"test-token");CanonicalCatalogController.Request request=new CanonicalCatalogController.Request();request.dishId=31L;request.userId=8L;request.servings=BigDecimal.ONE;assertThrows(org.springframework.web.server.ResponseStatusException.class,()->c.scale("wrong",request));verifyNoInteractions(dishes);Dish d=new Dish();when(dishes.getDishById(31L,8L)).thenReturn(d);when(catalog.scale(d,BigDecimal.ONE)).thenReturn(JSON.createObjectNode());c.scale("test-token",request);verify(dishes).getDishById(31L,8L);}
}
