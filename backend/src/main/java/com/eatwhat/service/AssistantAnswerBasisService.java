package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** Small transient evidence projection, never a persisted model memory. */
public final class AssistantAnswerBasisService {
 private final ObjectMapper json;
 public AssistantAnswerBasisService(ObjectMapper json){this.json=json;}
 public AnswerBasis build(ModelContext context,List<ReadResult> reads){
  LinkedHashMap<Long,EvidenceItem> items=new LinkedHashMap<>();
  LinkedHashSet<Long> priority=new LinkedHashSet<>();
  for(Map<String,Object> row:rows(context.getActiveMeal().get("currentDishes")))add(items,row,String.valueOf(context.getActiveMeal().get("planVersion")));
  for(ReadResult read:reads){
   if("read_current_meal".equals(read.getName())){items.clear();priority.clear();for(Map<String,Object> meal:read.getItems())for(Map<String,Object> row:rows(meal.get("currentDishes")))add(items,row,read.getSourceVersion());}
   else if(Arrays.asList("search_dishes","search_by_ingredients","get_dish_details","get_dish_methods","read_favorites").contains(read.getName())){LinkedHashSet<Long> recent=new LinkedHashSet<>();for(Map<String,Object> row:read.getItems()){add(items,row,read.getSourceVersion());if(row.get("id") instanceof Number)recent.add(((Number)row.get("id")).longValue());}recent.addAll(priority);priority=recent;}
  }
  AnswerBasis basis=new AnswerBasis();
  priority.addAll(items.keySet());for(Long id:priority){if(basis.getItems().size()==10)break;if(items.containsKey(id))basis.getItems().add(items.get(id));}
  // Optional ingredient details are removed before core identity/time facts.
  for(int i=basis.getItems().size()-1;size(basis)>8000&&i>=0;i--)basis.getItems().get(i).getFields().remove("ingredients");
  if(size(basis)>8000)throw new IllegalArgumentException("回答依据过多，请缩小菜品范围");return basis;
 }
 private void add(Map<Long,EvidenceItem> items,Map<String,Object> row,String source){
  Object id=row.get("id");if(!(id instanceof Number)||((Number)id).longValue()<1)return;
  long key=((Number)id).longValue();EvidenceItem item=new EvidenceItem();item.setKey("dish:"+key);item.setEntityType("dish");item.setEntityId(key);item.setSourceVersion(source==null?null:source.substring(0,Math.min(100,source.length())));
  for(String field:Arrays.asList("name","type")){Object value=row.get(field);if(value instanceof String&&((String)value).length()<=200)item.getFields().put(field,value);}
  Object time=row.get("cookMinutes");if(time instanceof Number&&((Number)time).intValue()>0&&((Number)time).doubleValue()==((Number)time).intValue()&&((Number)time).intValue()<=480)item.getFields().put("cookMinutes",((Number)time).intValue());else item.getUnknownFields().add("cookMinutes");
  List<String> ingredients=new ArrayList<>();for(Map<String,Object> fact:rows(row.get("ingredientFacts"))){Object name=fact.get("name");if(name instanceof String&&!((String)name).trim().isEmpty()&&((String)name).length()<=200&&!ingredients.contains(name))ingredients.add((String)name);if(ingredients.size()==30)break;}
  if(!ingredients.isEmpty())item.getFields().put("ingredients",ingredients);else item.getUnknownFields().add("ingredients");
  // tagCodes alone are not evidence that low-oil/low-salt claims were verified.
  items.put(key,item);
 }
 private int size(Object value){try{return json.writeValueAsString(value).length();}catch(Exception e){throw new IllegalArgumentException("回答依据不可用",e);}}
 @SuppressWarnings("unchecked") private static List<Map<String,Object>> rows(Object value){if(!(value instanceof List))return Collections.emptyList();List<Map<String,Object>> out=new ArrayList<>();for(Object row:(List<?>)value)if(row instanceof Map)out.add((Map<String,Object>)row);return out;}
}
