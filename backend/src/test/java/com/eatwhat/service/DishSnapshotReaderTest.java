package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.util.DishSnapshotReader;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class DishSnapshotReaderTest {
 final ObjectMapper json=new ObjectMapper();
 @Test void historicalCalendarKeepsReadableDishDespiteOldMetadataAndSqlTimestamp() throws Exception {
  String stored="[{\"id\":7,\"name\":\"历史青菜\",\"type\":\"veg\",\"cl\":\"青菜\",\"step\":\"煮熟\",\"createTime\":\"2026-10-20 18:30:00\",\"sourceKind\":\"legacy\",\"sourceDishIds\":[1],\"estimated\":true,\"recipeProvenance\":{},\"contentRevision\":2}]";
  RecipeRecord record=new RecipeRecord();record.setDishDetailsString(stored);
  assertEquals(1,record.getDishDetails().size());assertEquals("历史青菜",record.getDishDetails().get(0).getName());
  assertEquals("煮熟",record.getDishDetails().get(0).getStep());assertNull(record.getDishDetails().get(0).getRecipe());
  assertEquals(java.time.Instant.parse("2026-10-20T10:30:00Z").toEpochMilli(),record.getDishDetails().get(0).getCreateTime().getTime());
  assertTrue(json.isEnabled(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES),"trusted reader must not relax HTTP mapper");
 }
 @Test void trustedDatesAlsoAcceptExistingIsoAndEpochSnapshots() throws Exception {
  for(String value:Arrays.asList("\"2026-10-20T10:30:00.000Z\"","1792492200000")){
   List<Dish> restored=DishSnapshotReader.readDishes(json,"[{\"id\":1,\"name\":\"菜\",\"createTime\":"+value+"}]");
   assertNotNull(restored.get(0).getCreateTime());
  }
 }
 Dish dish(){Dish d=new Dish();d.setId(1L);d.setName("青菜");d.setType("veg");d.setCookMinutes(5);CanonicalTestDish.attach(d);CanonicalTestDish.catalog().enrich(d);return d;}
 @Test void trustedWorkspaceHistoryRoundTripKeepsOriginalVersionsButStillRejectsChangedRecipes() throws Exception {
  Dish d=dish();String version=d.getContentVersion();MealWorkspace w=new MealWorkspace();w.getDraft().getDishes().add(d);PlanDraft old=new PlanDraft();old.getDishes().add(d);w.getDraft().getHistory().add(old);
  MealWorkspace restored=DishSnapshotReader.read(json,json.writeValueAsString(w),MealWorkspace.class);
  assertEquals(version,restored.getDraft().getDishes().get(0).getContentVersion());assertEquals(version,restored.getDraft().getHistory().get(0).getDishes().get(0).getContentVersion());
  assertEquals(version,MealWorkspaceRules.copy(restored.getDraft()).getDishes().get(0).getContentVersion());assertTrue(MealWorkspaceRules.sameRecipe(d,restored.getDraft().getDishes().get(0)));
  Dish changed=dish();ObjectNode recipe=changed.getRecipe().deepCopy();recipe.put("name","更改配方");changed.setRecipe(recipe);assertFalse(MealWorkspaceRules.sameRecipe(changed,restored.getDraft().getDishes().get(0)));
 }
 @Test void ordinaryHttpDeserializationCannotSetTrustedVersionOrSavedPlanString() throws Exception {
  Dish d=dish();ObjectNode request=json.valueToTree(d);String forged=String.join("",Collections.nCopies(64,"a"));request.put("contentVersion",forged);request.put("receiptContentVersion",forged);request.put("snapshotContentVersion",forged);
  ObjectMapper transport=json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,false);Dish decoded=transport.treeToValue(request,Dish.class);assertNotEquals(forged,decoded.getContentVersion());
  ObjectNode plan=transport.createObjectNode();plan.put("dishDetailsString","["+request+"]");RecipeRecord received=transport.treeToValue(plan,RecipeRecord.class);assertTrue(received.getDishDetails().isEmpty());
 }
 @Test void persistedPlanAndDishArraysKeepVersionAfterCustomerProjection() throws Exception {
  Dish d=dish();String saved=json.writeValueAsString(Collections.singletonList(d));assertEquals(d.getContentVersion(),DishSnapshotReader.readDishes(json,saved).get(0).getContentVersion());
  RecipeRecord plan=new RecipeRecord();plan.setDishDetailsString(saved);assertEquals(d.getContentVersion(),plan.getDishDetails().get(0).getContentVersion());
  RecipeRecord copy=DishSnapshotReader.convert(json,plan,RecipeRecord.class);assertEquals(d.getContentVersion(),copy.getDishDetails().get(0).getContentVersion());
  plan.setDishDetailsString("[]");assertTrue(plan.getDishDetails().isEmpty(),"a newly loaded persisted snapshot cannot reuse the previous decoded list");
 }
 @Test void trustedSnapshotPreservesHighPrecisionFixedQuantity() throws Exception {
  Dish d=dish();java.math.BigDecimal quantity=new java.math.BigDecimal("0.666666666666666666666666666666666666");ObjectNode recipe=d.getRecipe().deepCopy();((ObjectNode)recipe.path("ingredients").get(0)).put("quantity",quantity);d.setRecipe(recipe);
  Dish restored=DishSnapshotReader.readDishes(json,json.writeValueAsString(Collections.singletonList(d))).get(0);
  assertEquals(0,quantity.compareTo(restored.getRecipe().path("ingredients").get(0).path("quantity").decimalValue()));
  assertEquals(d.getContentVersion(),restored.getContentVersion());
 }

}
