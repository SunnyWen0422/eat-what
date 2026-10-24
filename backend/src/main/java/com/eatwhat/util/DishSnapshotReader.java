package com.eatwhat.util;

import com.eatwhat.dto.MealWorkspace;
import com.eatwhat.dto.PlanDraft;
import com.eatwhat.entity.CustomRecipe;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.RecipeRecord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;

/** Only for server-owned persisted snapshots or copies of already trusted objects.
 * Never use this reader for HTTP request bodies: public recipe projections omit
 * calculation dependencies and cannot independently reproduce their source hash. */
public final class DishSnapshotReader {
 private DishSnapshotReader() {}
 public static <T> T read(ObjectMapper json,String savedJson,Class<T> type) throws IOException {
  json=exact(json);JsonNode node=json.readTree(savedJson);T value=json.treeToValue(node,type);restore(json,node,value,0);return value;
 }
 public static <T> T convert(ObjectMapper json,Object trusted,Class<T> type) {
  json=exact(json);JsonNode node=json.valueToTree(trusted);T value=json.convertValue(node,type);restore(json,node,value,0);return value;
 }
 public static List<Dish> readDishes(ObjectMapper json,String savedJson) throws IOException {json=exact(json);return dishes(json,json.readTree(savedJson));}
 public static List<Dish> convertDishes(ObjectMapper json,Object trusted){json=exact(json);return dishes(json,json.valueToTree(trusted));}
 private static ObjectMapper exact(ObjectMapper json){return json.copy().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);}
 private static List<Dish> dishes(ObjectMapper json,JsonNode node){
  if(node==null||!node.isArray())throw new IllegalArgumentException("Invalid saved dish snapshot");
  List<Dish> out=new ArrayList<>();for(JsonNode item:node){Dish dish=json.convertValue(item,Dish.class);restore(json,item,dish,0);out.add(dish);}return out;
 }
 private static void restore(ObjectMapper json,JsonNode node,Object value,int depth){
  if(value==null||node==null||node.isNull())return;if(depth>64)throw new IllegalArgumentException("Saved dish snapshot nesting exceeds limit");
  if(value instanceof Dish){
   Dish dish=(Dish)value;JsonNode version=node.get("contentVersion");
   if(version!=null&&version.isTextual()&&version.asText().matches("[a-fA-F0-9]{64}")&&node.path("id").canConvertToLong()&&Objects.equals(dish.getId(),node.path("id").longValue()))dish.restoreReceiptContentVersion(version.asText());
  } else if(value instanceof MealWorkspace){restore(json,node.path("draft"),((MealWorkspace)value).getDraft(),depth+1);
  } else if(value instanceof PlanDraft){
   PlanDraft draft=(PlanDraft)value;restoreList(json,node.path("dishes"),draft.getDishes(),depth+1);restoreList(json,node.path("history"),draft.getHistory(),depth+1);
  } else if(value instanceof RecipeRecord){
   if(node.path("dishDetails").isArray())((RecipeRecord)value).setDishDetails(dishes(json,node.path("dishDetails")));
  } else if(value instanceof CustomRecipe){
   if(node.path("dishes").isArray())((CustomRecipe)value).setDishes(dishes(json,node.path("dishes")));
  }
 }
 private static void restoreList(ObjectMapper json,JsonNode nodes,List<?> values,int depth){
  if(values==null||!nodes.isArray())return;if(nodes.size()!=values.size())throw new IllegalArgumentException("Saved dish snapshot count differs");
  for(int index=0;index<values.size();index++)restore(json,nodes.get(index),values.get(index),depth);
 }
}
