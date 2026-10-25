package com.eatwhat.service;

import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** Read-only transport adapter. recipe_records is the only meal fact store.
 * The old DTO field names remain wire-compatible; they are not a second record. */
public final class MealRecordProjection {
 private static final ObjectMapper JSON=new ObjectMapper();
 private MealRecordProjection(){}
 public static MealConsumption from(RecipeRecord record){
  if(record==null||Boolean.TRUE.equals(record.getIsDeleted()))return null;
  MealConsumption out=new MealConsumption();out.setId(record.getId());out.setUserId(record.getUserId());out.setMealDate(record.calendarDay());out.setMealType(record.getMealType());out.setRevision(record.getRevision());out.setStatus("recorded");out.setSourceRecordId(record.getId());
  List<Map<String,Object>> entries=new ArrayList<>();
  for(Dish dish:record.getDishDetails()){
   Map<String,Object> entry=new LinkedHashMap<>();if(dish.getId()!=null)entry.put("dishId",String.valueOf(dish.getId()));entry.put("name",dish.getName());
   String type=dish.getType();Map<String,String> names=new HashMap<>();names.put("荤菜","meat");names.put("素菜","veg");names.put("汤","soup");names.put("汤品","soup");names.put("主食","staple");names.put("甜品","dessert");entry.put("type",names.getOrDefault(type,type));
   entry.put("nutritionSnapshot",DietNutritionSummary.snapshot(dish,JSON));entries.add(entry);
  }
  if(entries.isEmpty()&&record.getRecipeName()!=null&&!record.getRecipeName().trim().isEmpty()){
   Map<String,Object> entry=new LinkedHashMap<>();entry.put("name",record.getRecipeName());entries.add(entry);
  }
  out.setActualDishes(entries);
  try{out.setActualDishesJson(JSON.writeValueAsString(entries));}catch(Exception e){throw new IllegalStateException("餐次记录无法读取",e);}
  return out;
 }
 public static List<MealConsumption> from(List<RecipeRecord> records){
  Map<String,RecipeRecord> slots=new LinkedHashMap<>();
  for(RecipeRecord record:records){if(record==null||record.calendarDay()==null)continue;String key=record.getUserId()+"|"+record.calendarDay()+"|"+record.getMealType();RecipeRecord prior=slots.get(key);
   if(prior==null||Objects.toString(record.getRevision(),"0").equals(Objects.toString(prior.getRevision(),"0"))||(record.getRevision()!=null&&(prior.getRevision()==null||record.getRevision()>prior.getRevision())))slots.put(key,record);
  }
  List<MealConsumption> result=new ArrayList<>();for(RecipeRecord record:slots.values()){MealConsumption item=from(record);if(item!=null)result.add(item);}return result;
 }
}
