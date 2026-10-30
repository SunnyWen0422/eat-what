package com.eatwhat.service;

import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class HistoricalRecipeNutritionTest {
 final ObjectMapper json=new ObjectMapper();
 final CanonicalCatalogMapper definitions=mock(CanonicalCatalogMapper.class);
 final Map<String,JsonNode> facts=new LinkedHashMap<>();
 final ObjectNode metadata=json.createObjectNode().put("catalogContractVersion",4).put("quantityPolicy","fixed-recipe-v1").put("catalogRevision","current-1").put("nutritionRuleVersion","rule-1");
 final HistoricalRecipeNutritionService service;
 HistoricalRecipeNutritionTest() throws Exception {
  facts.putAll(CanonicalV4CalculationTest.definitions());
  when(definitions.metadata()).thenAnswer(c->metadata.toString());
  when(definitions.ingredients(anyCollection())).thenAnswer(c->{List<String> out=new ArrayList<>();for(Object id:(Collection<?>)c.getArgument(0))if(facts.containsKey(id))out.add(facts.get(id).toString());return out;});
  service=new HistoricalRecipeNutritionService(new CanonicalCatalogService(definitions,json),json);
 }
 Dish saved() throws Exception {Dish dish=new Dish();dish.setId(1L);dish.setName("旧菜");dish.setType("veg");dish.setCatalogRevision("original-1");ObjectNode recipe=CanonicalV4CalculationTest.recipe();recipe.putObject("calculatedNutrition").put("completeness","partial").putNull("total");dish.setRecipe(recipe);return dish;}
 RecipeRecord record(String day,Dish... dishes){RecipeRecord record=new RecipeRecord();record.setId(12L);record.setUserId(7L);record.setRecordDateString(day);record.setMealType("dinner");record.setRevision(3L);record.setTargetPeople(9);record.setDishDetails(Arrays.asList(dishes));return record;}
 JsonNode nutrition(List<MealConsumption> rows){return json.valueToTree(rows.get(0).getActualDishes().get(0).get("nutritionSnapshot"));}
 Map<String,Object> report(List<RecipeRecord> rows){DietReviewCalculator calculator=new DietReviewCalculator(json);calculator.setHistoricalNutrition(service);return calculator.report(7L,Collections.emptyList(),rows,LocalDate.parse("2026-10-01"),LocalDate.parse("2026-10-07"),Instant.parse("2026-10-03T04:00:00Z"));}
 @Test void workspaceReadRefreshesOnlyDetachedNutritionAndKeepsMenuRevisionAndReceipts() throws Exception {
  com.eatwhat.dto.MealWorkspace original=new com.eatwhat.dto.MealWorkspace();original.setId("workspace");original.setRevision(7L);original.getDraft().setPlanVersion(9L);original.getDraft().setCanUndo(true);Dish source=saved();original.getDraft().setDishes(Arrays.asList(source));
  String before=json.writeValueAsString(original),raw=source.getRecipeJson(),version=source.getContentVersion();
  MealWorkspaceService workspaces=new MealWorkspaceService(null,null,null,null,null,json,null);workspaces.setHistoricalNutrition(service);
  com.eatwhat.dto.MealWorkspace shown=workspaces.presentation(7L,original);Dish dish=shown.getDraft().getDishes().get(0);
  assertEquals("complete",dish.getRecipe().path("calculatedNutrition").path("completeness").asText());assertEquals(CanonicalRecipeCalculator.NUTRITION_SCOPE,dish.getRecipe().path("calculatedNutrition").path("scope").asText());assertEquals(10,dish.getRecipe().path("calculatedNutrition").path("total").path("energyKcal").asInt());
  assertEquals(raw,dish.getRecipeJson());assertEquals(version,dish.getContentVersion());assertEquals(7L,shown.getRevision());assertEquals(9L,shown.getDraft().getPlanVersion());assertTrue(shown.getDraft().isCanUndo());assertEquals(before,json.writeValueAsString(original));
 }
 @Test void savedSeasoningUnknownDoesNotBlockMainNutritionAndMetadataUsesCurrentRule() throws Exception {
  Dish old=saved();ObjectNode recipe=(ObjectNode)old.getRecipe();ObjectNode extra=((ObjectNode)recipe.path("ingredients").get(0)).deepCopy();
  extra.put("id","salt").put("role","seasoning").putNull("quantity").put("quantityKind","discretionary").put("quantityDisplay","适量");((ArrayNode)recipe.path("ingredients")).add(extra);old.setRecipe(recipe);
  String before=old.getRecipeJson();JsonNode n=nutrition(service.project(7L,Arrays.asList(record("2026-10-01",old))));
  assertEquals("complete",n.path("completeness").asText());assertEquals(10,n.path("total").path("energyKcal").asInt());assertEquals(CanonicalRecipeCalculator.NUTRITION_SCOPE,n.path("scope").asText());assertEquals(CanonicalRecipeCalculator.RULE_VERSION,n.path("nutritionRuleVersion").asText());assertEquals(before,old.getRecipeJson());
  assertEquals(CanonicalRecipeCalculator.RULE_VERSION,new CanonicalCatalogService(definitions,json).metadata().path("nutritionRuleVersion").asText());
 }
 @Test void savedAmountsAndRetentionWinOverCurrentDishAndOriginalPartialBecomesComplete() throws Exception {
  Dish old=saved();ObjectNode line=(ObjectNode)old.getRecipe().path("ingredients").get(0);line.put("quantity",123.45);line.putObject("nutrientRetention").put("energyKcal",0.5);old.setRecipe(old.getRecipe());
  RecipeRecord record=record("2026-10-01",old);String encoded=record.getDishDetailsString(),raw=old.getRecipeJson(),version=old.getContentVersion();
  Dish current=saved();((ObjectNode)current.getRecipe().path("ingredients").get(0)).put("quantity",9999);
  JsonNode n=nutrition(service.project(7L,Arrays.asList(record)));
  assertEquals("complete",n.path("completeness").asText());assertEquals(0,new BigDecimal("6.1725").compareTo(n.path("total").path("energyKcal").decimalValue()));
  assertEquals(version,n.path("originalRecipeVersion").asText());assertEquals("original-1",n.path("originalCatalogRevision").asText());assertEquals("current-1",n.path("catalogRevision").asText());
  assertEquals(encoded,record.getDishDetailsString());assertEquals(raw,old.getRecipeJson());assertEquals(version,old.getContentVersion());assertEquals(9,record.getTargetPeople());assertEquals(3L,record.getRevision());assertEquals("2026-10-01",record.calendarDay());
  assertEquals("partial",old.getRecipe().path("calculatedNutrition").path("completeness").asText());
  verify(definitions,times(1)).ingredients(Collections.singleton("a"));verify(definitions,never()).searchIngredients(anyString());
 }
 @Test void changedStandardChangesVersionsEvenWithoutRecipeOrMetadataRevision() throws Exception {
  Dish old=saved();RecipeRecord record=record("2026-10-01",old);JsonNode before=nutrition(service.project(7L,Arrays.asList(record)));Map<String,Object> prior=report(Arrays.asList(record));
  ((ObjectNode)facts.get("a").path("nutritionPer100g")).put("energyKcal",10.51);
  JsonNode after=nutrition(service.project(7L,Arrays.asList(record)));Map<String,Object> next=report(Arrays.asList(record));
  assertNotEquals(before.path("nutritionVersion"),after.path("nutritionVersion"));assertEquals(before.path("originalRecipeVersion"),after.path("originalRecipeVersion"));
  assertNotEquals(((Map<?,?>)prior.get("metadata")).get("sourceFingerprint"),((Map<?,?>)next.get("metadata")).get("sourceFingerprint"));assertNotEquals(((Map<?,?>)prior.get("metadata")).get("reportId"),((Map<?,?>)next.get("metadata")).get("reportId"));
  JsonNode summary=json.valueToTree(next).path("blocks").path("actualDetails").path("nutrition");assertEquals(11,summary.path("total").path("energyKcal").intValue());assertFalse(summary.path("personalIntakeAvailable").asBoolean());
 }
 @Test void unknownIdentityQuantitySpecificationUnitAndRetentionNeverReuseOldTotals() throws Exception {
  for(String defect:Arrays.asList("id","quantity","specification","unit","retention","legacy")){
   Dish old=saved();ObjectNode recipe=(ObjectNode)old.getRecipe(),line=(ObjectNode)recipe.path("ingredients").get(0);
   ObjectNode n=recipe.putObject("calculatedNutrition");n.put("completeness","complete");for(String key:CanonicalRecipeCalculator.NUTRIENTS)n.putObject("total").put(key,9999);
   if(defect.equals("id"))line.put("ingredientId","unknown-a");
   if(defect.equals("quantity"))line.putNull("quantity");
   if(defect.equals("unit"))line.put("unit","piece");
   if(defect.equals("retention"))line.put("nutritionContribution","unknown");
   if(defect.equals("legacy"))recipe.put("catalogContractVersion",3);
   old.setRecipe(recipe);
   if(defect.equals("specification"))((ObjectNode)old.getRecipe().path("ingredients").get(0)).putObject("ingredient").put("id","a").put("specification","cooked");
   JsonNode result=nutrition(service.project(7L,Arrays.asList(record("2026-10-01",old))));assertEquals("partial",result.path("completeness").asText(),defect);assertTrue(result.path("total").isNull(),defect);
  }
 }
 @Test void disabledOptionalAndUnknownRecipeFactsArePreserved() throws Exception {
  Dish old=saved();ObjectNode recipe=(ObjectNode)old.getRecipe(),optional=((ObjectNode)recipe.path("ingredients").get(0)).deepCopy();optional.put("id","option").put("optional",true).put("defaultEnabled",false).put("quantityKind","discretionary").putNull("quantity").put("quantityDisplay","适量");((ArrayNode)recipe.path("ingredients")).add(optional);old.setRecipe(recipe);
  assertEquals("complete",nutrition(service.project(7L,Arrays.asList(record("2026-10-01",old)))).path("completeness").asText());
  optional.put("defaultEnabled",true);old.setRecipe(recipe);assertTrue(nutrition(service.project(7L,Arrays.asList(record("2026-10-01",old)))).path("total").isNull());
 }
 @Test void oneBatchForRepeatedIngredientDependenciesAndNoBusinessWrites() throws Exception {
  RecipeRecordMapper rows=mock(RecipeRecordMapper.class);MealConsumptionMapper retired=mock(MealConsumptionMapper.class);DishQueryService current=mock(DishQueryService.class);
  List<RecipeRecord> records=Arrays.asList(record("2026-10-01",saved(),saved()),record("2026-10-02",saved()));when(rows.selectRangeDays(7L,"2026-10-01","2026-10-02")).thenReturn(records);
  MealConsumptionService meals=new MealConsumptionService(retired,rows,current,json,new DietReviewCalculator(json));meals.setHistoricalNutrition(service);Map<String,Object> view=meals.overview(7L,"2026-10-01","2026-10-02");assertNotNull(view.get("nutritionVersion"));
  verify(definitions,times(1)).ingredients(Collections.singleton("a"));verify(rows).selectRangeDays(7L,"2026-10-01","2026-10-02");verify(rows).slotRevisions(7L,"2026-10-01","2026-10-02");verifyNoMoreInteractions(rows);verifyNoInteractions(current,retired);
 }
 @Test void futureAndDeletedMealsAreNotIncludedInCurrentReview() throws Exception {
  RecipeRecord past=record("2026-10-01",saved()),future=record("2026-10-05",saved()),deleted=record("2026-10-02",saved());deleted.setIsDeleted(true);
  JsonNode report=json.valueToTree(report(Arrays.asList(past,future,deleted)));assertEquals(1,report.path("mealCount").asInt());assertEquals(1,report.path("blocks").path("actualDetails").path("nutrition").path("entryCount").asInt());assertEquals(10,report.path("blocks").path("actualDetails").path("nutrition").path("total").path("energyKcal").asInt());
 }
 @Test void accountIsolationIsCheckedBeforeIngredientLookup() throws Exception {
  RecipeRecord foreign=record("2026-10-01",saved());foreign.setUserId(8L);assertThrows(IllegalArgumentException.class,()->service.project(7L,Arrays.asList(foreign)));verifyNoInteractions(definitions);
  RecipeRecord owned=record("2026-10-01",saved());owned.getDishDetails().get(0).setUserId(8L);assertThrows(IllegalArgumentException.class,()->service.project(7L,Arrays.asList(owned)));verifyNoInteractions(definitions);
 }
 @Test void assistantReadsAndContextUseCurrentSavedRecipeNutritionAndVersion() throws Exception {
  AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();RecipeRecord record=record("2026-10-01",saved());when(f.meals.overview(anyLong(),anyString(),anyString())).thenReturn(Collections.singletonMap("plans",Arrays.asList(record)));
  AssistantReadToolService reads=f.reads();reads.setHistoricalNutrition(service);com.eatwhat.dto.AssistantV4Contract.ReadResult first=reads.read(7L,f.call("read_actual_diet_review","startDate","2026-10-01","endDate","2026-10-01"),f.scope);
  assertEquals(10,json.valueToTree(first).path("items").get(0).path("actual").get(0).path("nutrition").path("total").path("energyKcal").asInt());
  ((ObjectNode)facts.get("a").path("nutritionPer100g")).put("energyKcal",20);assertNotEquals(first.getSourceVersion(),reads.read(7L,f.call("read_actual_diet_review","startDate","2026-10-01","endDate","2026-10-01"),f.scope).getSourceVersion());
  AssistantV4ContextTest.Fixture c=new AssistantV4ContextTest.Fixture();RecipeRecord recent=record("2026-10-10",saved());when(c.actual.records(7L,"2026-10-05","2026-10-11")).thenReturn(Arrays.asList(recent));AssistantV4ContextService context=c.service();context.setHistoricalNutrition(service);
  JsonNode view=json.valueToTree(context.build(7L,c.request,c.session));assertEquals(20,view.path("recentActual").get(0).path("nutrition").path("total").path("energyKcal").asInt());assertEquals(64,view.path("recentActual").get(0).path("nutrition").path("nutritionVersion").asText().length());
 }
 @Test void calendarDetailsDetachCurrentNutritionWithoutChangingSourceOrConfirmationVersion() throws Exception {
  Dish original=saved();original.setKcal(999);original.setScaledRecipe(json.createObjectNode().set("nutrition",json.createObjectNode().put("completeness","partial").putNull("total")));
  RecipeRecord record=record("2026-10-01",original);String encoded=record.getDishDetailsString(),raw=original.getRecipeJson(),version=original.getContentVersion(),rawVersion=com.eatwhat.util.DishContentVersion.rawOf(original);
  RecipeRecordMapper rows=mock(RecipeRecordMapper.class);DishQueryService today=mock(DishQueryService.class);when(rows.selectByUserAndDate(7L,"2026-10-01")).thenReturn(Arrays.asList(record));RecipeRecordService calendar=new RecipeRecordService(rows,today);calendar.setHistoricalNutrition(service);
  RecipeRecord display=calendar.getRecordsByDate(7L,"2026-10-01").get(0);Dish dish=display.getDishDetails().get(0);
  assertNotSame(record,display);assertNotSame(original,dish);assertEquals("旧菜",display.getDishNames());assertEquals("complete",dish.getRecipe().path("calculatedNutrition").path("completeness").asText());assertEquals(10,dish.getRecipe().path("calculatedNutrition").path("total").path("energyKcal").asInt());assertEquals(dish.getRecipe().path("calculatedNutrition"),dish.getScaledRecipe().path("nutrition"));assertNull(dish.getKcal());
  assertEquals(version,dish.getContentVersion());assertEquals(rawVersion,com.eatwhat.util.DishContentVersion.rawOf(dish));assertTrue(MealWorkspaceRules.sameRecipe(original,dish));assertEquals(raw,dish.getRecipeJson());assertEquals("original-1",dish.getCatalogRevision());assertEquals(original.getRecipe().path("ingredients"),dish.getRecipe().path("ingredients"));assertEquals(original.getRecipe().path("steps"),dish.getRecipe().path("steps"));
  assertEquals(encoded,record.getDishDetailsString());assertNull(record.getDishNames());assertEquals(999,original.getKcal());assertEquals("partial",original.getRecipe().path("calculatedNutrition").path("completeness").asText());assertEquals(9,display.getTargetPeople());assertEquals(3L,display.getRevision());
  Dish roundTrip=com.eatwhat.util.DishSnapshotReader.readDishes(json,display.getDishDetailsString()).get(0);assertEquals(version,roundTrip.getContentVersion());assertTrue(MealWorkspaceRules.sameRecipe(original,roundTrip));
  ((ObjectNode)dish.getRecipe().path("ingredients").get(0)).put("quantity",999);assertEquals(100,original.getRecipe().path("ingredients").get(0).path("quantity").asInt());verifyNoInteractions(today);verify(rows).selectByUserAndDate(7L,"2026-10-01");verifyNoMoreInteractions(rows);verify(definitions,times(1)).ingredients(Collections.singleton("a"));
 }
 @Test void overviewDetailsAndSummaryShareOneRecalculationAndUnknownsStayNull() throws Exception {
  Dish known=saved(),unknown=saved();((ObjectNode)unknown.getRecipe().path("ingredients").get(0)).putNull("quantity");unknown.setRecipe(unknown.getRecipe());RecipeRecord source=record("2026-10-01",known,unknown);String encoded=source.getDishDetailsString();
  RecipeRecordMapper rows=mock(RecipeRecordMapper.class);when(rows.selectRangeDays(7L,"2026-10-01","2026-10-01")).thenReturn(Arrays.asList(source));MealConsumptionService meals=new MealConsumptionService(mock(MealConsumptionMapper.class),rows,mock(DishQueryService.class),json,new DietReviewCalculator(json));meals.setHistoricalNutrition(service);
  JsonNode view=json.valueToTree(meals.overview(7L,"2026-10-01","2026-10-01"));JsonNode details=view.path("plans").get(0).path("dishDetails");assertEquals("complete",details.get(0).path("recipe").path("calculatedNutrition").path("completeness").asText());assertTrue(details.get(1).path("recipe").path("calculatedNutrition").path("total").isNull());assertEquals(10,view.path("consumptions").get(0).path("actualDishes").get(0).path("nutritionSnapshot").path("total").path("energyKcal").asInt());assertEquals(64,view.path("consumptions").get(0).path("actualDishes").get(0).path("nutritionSnapshot").path("nutritionVersion").asText().length());assertEquals(encoded,source.getDishDetailsString());verify(definitions,times(1)).ingredients(Collections.singleton("a"));
 }
}
