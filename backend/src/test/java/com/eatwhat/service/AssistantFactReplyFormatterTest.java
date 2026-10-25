package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.eatwhat.service.AssistantV4ContextService.map;
import static com.eatwhat.service.AssistantFactReplyFormatter.AuthorizedReadFact;

class AssistantFactReplyFormatterTest {
 private final AssistantFactReplyFormatter formatter=new AssistantFactReplyFormatter();
 private AuthorizedReadFact fact(String name,boolean partial,Map<String,Object>... items){
  ReadResult r=new ReadResult();r.setName(name);r.setCallId("read");r.setItems(Arrays.asList(items));r.setTruncated(partial);
  ToolRead call=new ToolRead();call.setName(name);call.setCallId("read");return AuthorizedReadFact.fromRead(r,call);
 }
 private String reply(AuthorizedReadFact... facts){return formatter.format(Arrays.asList(facts),new ModelContext());}
 @Test void canonical_energy_survives_json_snapshot_and_is_rounded_after_equal_sharing(){
  com.fasterxml.jackson.databind.node.ObjectNode n=new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
  n.put("completeness","complete");n.putObject("total").put("energyKcal",100.49);
  AuthorizedReadFact f=fact("get_dish_details",false,map("id",1,"name","青菜","diners",8,"nutrition",n));
  n.with("total").put("energyKcal",9999);
  String text=reply(f);assertTrue(text.contains("整道100千卡"),text);assertTrue(text.contains("8人均分每人约13千卡"),text);assertFalse(text.contains("9999"));
 }
 @Test void partial_recipe_never_turns_subtotal_into_whole_recipe_energy(){
  String text=reply(fact("get_dish_details",false,map("id",1,"name","汤","diners",8,"nutrition",map("completeness","partial","total",null,"quantifiedSubtotal",map("total",map("energyKcal",100))))));
  assertTrue(text.contains("整道能量暂缺"),text);assertFalse(text.contains("100千卡"));assertFalse(text.contains("每人"));
 }
 @Test void actual_nutrition_remains_recipe_reference_and_partial_coverage_is_not_daily_intake(){
  Map<String,Object> meal=map("status","eaten","mealType","dinner","nutrition",map("basis","recipe_baseline","complete",false,"coveredCount",1,"entryCount",2,"knownTotal",map("energyKcal",100.6),"total",null));
  String text=reply(fact("read_actual_diet_review",false,map("date","2026-10-10","actual",Arrays.asList(meal))));
  assertTrue(text.contains("完整能量暂缺"),text);assertTrue(text.contains("1/2道"),text);assertTrue(text.contains("101千卡"),text);assertTrue(text.contains("不代表个人摄入"),text);
 }
 @Test void nutrition_keeps_its_own_paging_and_size_limit_notice(){
  Map<String,Object> dish=map("name","青菜","nutrition",map("completeness","complete","total",map("energyKcal",100)));
  assertTrue(formatter.nutrition(Arrays.asList(fact("get_dish_details",true,dish))).contains("部分营养信息"));
  List<AuthorizedReadFact> input=new ArrayList<>();for(int i=0;i<12;i++){Map<String,Object> copy=new HashMap<>(dish);copy.put("id",i);input.add(fact("get_dish_details",false,copy));}
  assertTrue(formatter.nutrition(input).contains("部分营养信息"));
 }
 @Test void partial_read_is_not_a_complete_total(){
  String text=reply(fact("read_shopping",true,map("id",1,"name","番茄","checked",false,"quantityValue",null,"quantityProvenance","unknown")));
  assertTrue(text.contains("这次查到1项"));assertTrue(text.contains("部分"));assertFalse(text.contains("用量未确认"));assertFalse(text.contains("共1项"));assertFalse(text.contains("0元"));
 }
 @Test void to_taste_shopping_quantities_are_not_reported_as_unconfirmed(){
  String text=reply(fact("read_shopping",false,map("id",1,"name","盐","checked",false,"quantityValue",null,"quantityText","适量","quantityProvenance","unknown")));
  assertTrue(text.contains("1项待采购"));assertFalse(text.contains("未确认"));assertFalse(text.contains("0克"));
 }
 @Test void final_page_and_next_cursor_still_do_not_imply_an_entire_total(){
  ReadResult r=new ReadResult();r.setName("read_favorites");r.setCallId("a");r.getItems().add(map("id",1,"name","青菜"));
  ToolRead call=new ToolRead();call.setName(r.getName());call.setCallId("a");call.getArguments().put("cursor","20");
  assertTrue(reply(AuthorizedReadFact.fromRead(r,call)).contains("部分"));call.getArguments().clear();r.setNextCursor("21");
  assertTrue(reply(AuthorizedReadFact.fromRead(r,call)).contains("部分"));
 }
 @Test void all_eleven_registered_read_tools_have_specific_factual_templates(){
  Set<String> registered=new HashSet<>(AssistantReadToolService.READS);registered.addAll(AssistantPersonalReadService.READS);assertEquals(11,registered.size());
  Map<String,String> expected=mapStrings("search_dishes","菜谱","search_by_ingredients","食材","get_dish_details","详情","get_dish_methods","做法","read_current_meal","当前餐","read_calendar","日历","read_shopping","采购","read_actual_diet_review","实吃","get_recommendation_options","筛选","read_favorites","收藏","read_saved_menus","常用菜单");
  assertEquals(registered,expected.keySet());for(String name:registered)assertTrue(reply(fact(name,false)).contains(expected.get(name)),name);
 }
 @Test void empty_actual_records_do_not_mean_the_user_did_not_eat(){
  String text=reply(fact("read_actual_diet_review",false,map("date","2026-10-10","actual",Collections.emptyList(),"summary",map("mealCount",0))));
  assertTrue(text.contains("没有记录不能判断是否进餐"));assertFalse(text.contains("没吃"));assertFalse(text.contains("没有进餐"));
 }
 private Map<String,Object> actualDay(String... meals){
  List<Map<String,Object>> actual=new ArrayList<>();for(String meal:meals)actual.add(map("date","2026-10-10","mealType",meal,"status","eaten","dishes",Collections.emptyList()));
  return map("date","2026-10-10","actual",actual);
 }
 private AuthorizedReadFact actualContext(boolean partial,String... meals){
  ReadResult read=new ReadResult();read.setName("read_actual_diet_review");read.setCallId("context");read.setTruncated(partial);read.getItems().add(actualDay(meals));return AuthorizedReadFact.fromContext(read);
 }
 @Test void full_executor_actual_read_wins_over_same_day_clipped_older_context_in_either_order(){
  AuthorizedReadFact executed=fact("read_actual_diet_review",false,actualDay("lunch","dinner")),older=actualContext(true,"dinner");
  for(List<AuthorizedReadFact> order:Arrays.asList(Arrays.asList(executed,older),Arrays.asList(older,executed))){
   String text=formatter.format(order,new ModelContext());assertTrue(text.contains("2餐明确记录"),text);assertFalse(text.contains("部分"),text);
  }
 }
 @Test void explicit_empty_actual_read_cannot_borrow_older_context_in_either_order(){
  AuthorizedReadFact empty=fact("read_actual_diet_review",false),older=actualContext(true,"dinner");
  for(List<AuthorizedReadFact> order:Arrays.asList(Arrays.asList(empty,older),Arrays.asList(older,empty))){
   String text=formatter.format(order,new ModelContext());assertTrue(text.contains("未查到明确记录"),text);assertTrue(text.contains("不能判断是否进餐"),text);assertFalse(text.contains("部分"),text);
  }
 }
 @Test void partial_executor_actual_read_keeps_its_own_partial_marker_without_borrowing_context(){
  String text=reply(fact("read_actual_diet_review",true,actualDay("dinner")),actualContext(false,"lunch","dinner"));
  assertTrue(text.contains("1餐明确记录"),text);assertTrue(text.contains("部分"),text);assertFalse(text.contains("2餐"),text);
 }
 @Test void context_only_actual_fallback_retains_the_snapshot_partial_marker(){
  String text=reply(actualContext(true,"dinner"));assertTrue(text.contains("1餐明确记录"));assertTrue(text.contains("部分"));
 }
 @Test void calendar_plans_and_explicit_actual_meals_are_separate(){
  String text=reply(fact("read_calendar",false,map("date","2026-10-10","plans",Arrays.asList(map("mealType","dinner")),"actual",Arrays.asList(map("status","eaten","mealType","lunch"),map("status","skipped")))));
  assertTrue(text.contains("1餐计划"));assertTrue(text.contains("1餐实吃"));assertTrue(text.contains("不代表已经吃过"));
 }
 @Test void current_meal_total_time_is_not_a_per_dish_limit(){
  String text=reply(fact("read_current_meal",false,map("date","2026-10-16","mealType","dinner","people",2,"totalCookMinutes",45,"currentDishes",Arrays.asList(map("id",1,"name","番茄炒蛋")))));
  assertTrue(text.contains("2026-10-16"));assertTrue(text.contains("晚餐"));assertTrue(text.contains("2人"));assertTrue(text.contains("番茄炒蛋"));assertTrue(text.contains("整餐用时上限45分钟"));assertFalse(text.contains("单菜"));assertFalse(text.contains("预计"));
 }
 @Test void method_and_detail_unknowns_are_not_filled_from_an_unrelated_context(){
  ModelContext ctx=new ModelContext();ctx.getConversation().put("recentText",Arrays.asList(map("text","已保存日历")));ctx.getActiveMeal().put("currentDishes",Arrays.asList(map("name","无关方案")));
  ReadResult read=new ReadResult();read.setName("get_dish_methods");read.setCallId("m");read.getItems().add(map("id",1,"name","青菜","steps",null));read.getUnknownFields().add("steps:1");
  ToolRead call=new ToolRead();call.setName(read.getName());call.setCallId(read.getCallId());String text=formatter.format(Arrays.asList(AuthorizedReadFact.fromRead(read,call)),ctx);
  assertTrue(text.contains("做法暂未提供"));assertTrue(text.contains("未知"));assertFalse(text.contains("已保存"));assertFalse(text.contains("无关方案"));
  assertTrue(reply(fact("get_dish_methods",false,map("id",1,"name","青菜","methods","炒熟"))).contains("步骤见卡片"));
 }
 @Test void serialized_empty_steps_do_not_claim_a_recipe_method_is_available(){
  for(String steps:Arrays.asList("[]","[\"\",\"  \"]","null","\"\"")){
   String text=reply(fact("get_dish_methods",false,map("id",1,"name","青菜","steps",steps)));
   assertTrue(text.contains("做法暂未提供"),steps);assertFalse(text.contains("步骤见卡片"),steps);
  }
 }
 @Test void saved_menu_options_and_search_use_returned_labels_not_raw_codes_or_inferred_criteria(){
  String text=reply(fact("read_saved_menus",false,map("id",1,"name","工作日晚餐","people",4,"dishIds",Arrays.asList(7,8))),fact("get_recommendation_options",false,map("group","flavor","code","LIGHT","label","清淡")),fact("search_dishes",false,map("id",7,"name","青菜","omittedFields",Arrays.asList("ingredients"))));
  assertTrue(text.contains("工作日晚餐"));assertTrue(text.contains("4人"));assertTrue(text.contains("2道菜"));assertTrue(text.contains("清淡"));assertFalse(text.contains("LIGHT"));assertTrue(text.contains("未提供"));
 }
 @Test void separate_menus_do_not_share_the_first_menus_people_or_dish_count(){
  String text=reply(fact("read_saved_menus",false,map("id",1,"name","双人晚餐","people",2,"dishIds",Arrays.asList(1,2)),map("id",2,"name","聚餐","people",6,"dishIds",Arrays.asList(1,2,3,4))));
  assertTrue(text.contains("「双人晚餐」 · 2人 · 2道菜"));assertTrue(text.contains("「聚餐」 · 6人 · 4道菜"));
 }
 @Test void empty_and_unknown_facts_cannot_create_receipts_or_fabricate_a_plan(){
  ModelContext context=new ModelContext();context.getActiveMeal().put("currentDishes",Arrays.asList(map("name","旧计划")));context.getLastActions().add(map("reply","已保存日历"));
  String text=formatter.format(Collections.emptyList(),context);assertFalse(text.contains("已保存"));assertFalse(text.contains("旧计划"));assertTrue(text.contains("请说明"));
  assertFalse(reply(fact("unknown_tool",false,map("text","已保存日历"))).contains("已保存"));
 }
 @Test void mixed_reads_deduplicate_and_bound_output_without_changing_input(){
  AuthorizedReadFact one=fact("search_dishes",false,map("id",1,"name","青菜"));
  String once=reply(one),twice=reply(one,one);assertEquals(once,twice);
  List<AuthorizedReadFact> facts=new ArrayList<>();for(int i=0;i<100;i++)facts.add(fact("search_dishes",false,map("id",i,"name",String.join("",Collections.nCopies(300,"字")))));
  String text=formatter.format(facts,new ModelContext());assertTrue(text.length()<=1800);assertTrue(text.contains("部分"));assertFalse(text.contains("共100"));
 }
 @Test void mismatched_read_identity_is_rejected_and_internal_fact_is_a_snapshot(){
  ReadResult read=new ReadResult();read.setName("search_dishes");read.setCallId("s");read.getItems().add(map("id",1,"name","青菜"));
  ToolRead call=new ToolRead();call.setName(read.getName());call.setCallId("different");assertThrows(IllegalArgumentException.class,()->AuthorizedReadFact.fromRead(read,call));
  call.setCallId("s");AuthorizedReadFact fact=AuthorizedReadFact.fromRead(read,call);read.getItems().get(0).put("name","changed");read.setTruncated(true);
  assertTrue(reply(fact).contains("青菜"));assertFalse(reply(fact).contains("changed"));
 }
 private Map<String,String> mapStrings(String... pairs){Map<String,String> map=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)map.put(pairs[i],pairs[i+1]);return map;}
}
