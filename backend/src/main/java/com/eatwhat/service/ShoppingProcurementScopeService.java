package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantShoppingContract.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.stream.Collectors;

/** Procurement identity survives assistant retention. Versions guard previews, not semantic meal identity. */
@Service
public class ShoppingProcurementScopeService implements CalendarSavedListener {
 private final ShoppingScopeAliasMapper aliases;
 private final MealConsumptionMapper locks;
 private final MealWorkspaceService workspaces;
 private final RecipeRecordMapper plans;
 private final DishQueryService dishes;
 private final ControlledToolHarnessService harness;
 private final TransactionTemplate tx;
 private final ObjectMapper json;
 public ShoppingProcurementScopeService(ShoppingScopeAliasMapper aliases,MealConsumptionMapper locks,MealWorkspaceService workspaces,
   RecipeRecordMapper plans,DishQueryService dishes,ControlledToolHarnessService harness,TransactionTemplate tx,ObjectMapper json){
  this.aliases=aliases;this.locks=locks;this.workspaces=workspaces;this.plans=plans;this.dishes=dishes;this.harness=harness;this.tx=tx;
  this.json=json.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true);
 }
 public ResolvedSource resolveSource(Long user,ShoppingSourceRef ref){
  if(user==null||user<1||ref==null)throw new IllegalArgumentException("采购来源无效");
  ResolvedSource source=new ResolvedSource();source.setSourceRef(ref);
  if("draft".equals(ref.getKind())){
   if(ref.getWorkspaceId()==null||ref.getDate()!=null||ref.getMealType()!=null)throw new IllegalArgumentException("草稿来源无效");
   MealWorkspace w=workspaces.get(user,ref.getWorkspaceId());
   if(!Arrays.asList("draft","planned").contains(w.getStatus())||w.getTaskId()!=null||!MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())||!MealWorkspaceRules.understandsRequirements(w.getDraft(),w.getContext()))throw new IllegalArgumentException("请先更新本餐安排");
   source.setDate(w.getContext().getDate());source.setMealType(w.getContext().getMealType());source.setPeople(w.getContext().getPeople());source.setWorkspaceId(w.getId());source.setWorkspaceRevision(w.getRevision());source.setPlanVersion(w.getDraft().getPlanVersion());source.setDishes(w.getDraft().getDishes());
  }else if("plan".equals(ref.getKind())){
   if(ref.getWorkspaceId()!=null)throw new IllegalArgumentException("计划来源无效");validateSlot(ref.getDate(),ref.getMealType());
   RecipeRecord plan=plans.findSlot(user,ref.getDate(),ref.getMealType());
   if(plan==null||Boolean.TRUE.equals(plan.getIsDeleted())||!user.equals(plan.getUserId()))throw new IllegalArgumentException("安排不存在或不可访问");
   source.setDate(ref.getDate());source.setMealType(ref.getMealType());source.setPeople(plan.getTargetPeople());source.setPlanRevision(plan.getRevision());
   List<Dish> snapshots=plan.getDishDetails();
   if(snapshots.isEmpty()||!plan.getDishIds().equals(snapshots.stream().map(Dish::getId).collect(Collectors.toList())))throw new IllegalArgumentException("安排缺少可信菜品快照，请更新安排");
   source.setDishes(snapshots);
  }else throw new IllegalArgumentException("采购来源无效");
  validateSlot(source.getDate(),source.getMealType());
  if(source.getPeople()==null||source.getPeople()<1||source.getPeople()>50)throw new IllegalArgumentException("请先补充这餐的用餐人数");
  if(source.getDishes().isEmpty()||source.getDishes().size()>10)throw new IllegalArgumentException("采购菜品数量无效");
  List<Long> ids=source.getDishes().stream().map(Dish::getId).collect(Collectors.toList());
  List<Dish> live=dishes.getDishesByIdsForUser(new ArrayList<>(new LinkedHashSet<>(ids)),user);
  Map<Long,Dish> byId=live.stream().collect(Collectors.toMap(Dish::getId,d->d,(a,b)->a));
  for(Dish snapshot:source.getDishes())if(snapshot.getId()==null||byId.get(snapshot.getId())==null||!snapshot.getContentVersion().equals(byId.get(snapshot.getId()).getContentVersion()))throw new MealConsumptionService.VersionConflict("菜谱内容或归属已变化，请更新安排后重新预览");
  source.setSemanticHash(semanticHash(source.getDishes(),source.getPeople()));return source;
 }
 public String resolveScope(Long user,ShoppingSourceRef source){return resolveScope(user,resolveSource(user,source));}
 /** Lock current recipe and evidence rows before batchAdd can reread source lines. */
 public void lockForConfirmation(Long user,ResolvedSource source){
  lock(user);List<Long> ids=source.getDishes().stream().map(Dish::getId).distinct().sorted().collect(Collectors.toList());
  Map<Long,Dish> current=aliases.lockDishes(user,ids).stream().collect(Collectors.toMap(Dish::getId,d->d));
  for(Dish d:current.values())d.setQuality(null);
  for(DishQualityMapper.Row row:aliases.lockProfiles(ids))try{Dish d=current.get(row.getDishId());if(d!=null){CatalogQuality q=json.readValue(row.getProfileJson(),CatalogQuality.class);if(!row.getDishId().equals(q.getDishId()))throw new IllegalStateException("菜谱证据来源无效");d.setQuality(q);}}catch(java.io.IOException error){throw new IllegalStateException("菜谱证据读取失败",error);}
  for(Dish expected:source.getDishes())if(!current.containsKey(expected.getId())||!expected.getContentVersion().equals(current.get(expected.getId()).getContentVersion()))throw new MealConsumptionService.VersionConflict("菜谱内容或证据已变化，请重新预览");
 }
 void lockAccount(Long user){lock(user);}
 public String resolveScope(Long user,ResolvedSource source){return tx.execute(t->{lock(user);
  if("plan".equals(source.getSourceRef().getKind())){
   // Also repair a failed post-save listener when the user starts a fresh conversation.
   String taskId=aliases.savedCalendarTask(user,source.getDate(),source.getMealType(),source.getPlanRevision());
   if(taskId!=null){ControlledToolTask task=harness.get(user,taskId);Map<String,Object> result=new LinkedHashMap<>(task.steps.get(0).result);result.remove("executed");result.remove("countsAsActual");result.remove("card");afterSaved(user,json.convertValue(result,CalendarSavedReceipt.class));}
  }
  String alias=alias(source);String existing=aliases.find(user,alias);if(existing!=null)return existing;String scope=UUID.randomUUID().toString();aliases.insert(user,alias,scope);String saved=aliases.find(user,alias);if(saved==null)throw new IllegalStateException("采购来源暂未保存");return saved;});}
 public String linkSavedPlan(Long user,ShoppingSourceRef draft,CalendarSavedReceipt receipt){
  return tx.execute(t->{lock(user);
   ControlledToolTask task=harness.get(user,receipt.getTaskId());
   if(task.steps.size()!=1||!"save_meal_to_target".equals(task.steps.get(0).tool)||!"completed".equals(task.steps.get(0).status))throw new IllegalArgumentException("保存回执无效");
   ControlledToolTask.Step step=task.steps.get(0);
   if(!Objects.equals(step.result.get("receiptRef"),receipt.getReceiptRef())||!Objects.equals(step.binding.get("sourceWorkspaceId"),draft.getWorkspaceId())||!"draft".equals(draft.getKind()))throw new IllegalArgumentException("保存来源无效");
   // Read the immutable successful task, never the possibly changed current workspace.
   Map<String,Object> r=step.result,b=step.binding;
   String targetDate=(String)r.get("targetDate"),targetMeal=(String)r.get("targetMealType");
   RecipeRecord plan=plans.findSlot(user,targetDate,targetMeal);
   if(plan==null||Boolean.TRUE.equals(plan.getIsDeleted())||!user.equals(plan.getUserId())||!Objects.equals(plan.getRevision(),((Number)r.get("targetPlanRevision")).longValue()))throw new MealConsumptionService.VersionConflict("已保存安排已变化，请重新查看");
   List<Dish> original=json.convertValue(b.get("dishes"),new TypeReference<List<Dish>>(){});Integer people=((Number)b.get("people")).intValue();
   String semantic=semanticHash(original,people);
   if(!semantic.equals(semanticHash(plan.getDishDetails(),plan.getTargetPeople())))throw new MealConsumptionService.VersionConflict("已保存安排内容已变化");
   ResolvedSource source=new ResolvedSource();source.setSourceRef(draft);source.setWorkspaceId(draft.getWorkspaceId());source.setDate((String)b.get("sourceDate"));source.setMealType((String)b.get("sourceMealType"));source.setSemanticHash(semantic);
   String planAlias=planAlias(targetDate,targetMeal,semantic);
   if(!Objects.equals(source.getDate(),targetDate)||!Objects.equals(source.getMealType(),targetMeal)){
    String existing=aliases.find(user,planAlias);if(existing!=null)return existing;aliases.insert(user,planAlias,UUID.randomUUID().toString());return aliases.find(user,planAlias);
   }
   String scope=resolveScope(user,source);String existing=aliases.find(user,planAlias);
   if(existing!=null&&!existing.equals(scope))throw new MealConsumptionService.VersionConflict("这餐已有独立采购来源，请核对清单");
   aliases.insert(user,planAlias,scope);if(!scope.equals(aliases.find(user,planAlias)))throw new IllegalStateException("采购来源关联暂未完成");return scope;
  });
 }
 public void afterSaved(Long user,CalendarSavedReceipt receipt){ShoppingSourceRef draft=new ShoppingSourceRef();draft.setKind("draft");draft.setWorkspaceId(receipt.getSourceWorkspaceId());linkSavedPlan(user,draft,receipt);}
 String semanticHash(List<Dish> values,Integer people){List<Object> content=new ArrayList<>();content.add(people);for(int i=0;i<values.size();i++){Dish d=values.get(i);content.add(Arrays.asList(i,d.getId(),d.getContentVersion()));}return hash(content);}
 private String alias(ResolvedSource source){return "draft".equals(source.getSourceRef().getKind())?hash(Arrays.asList("draft",source.getWorkspaceId(),source.getDate(),source.getMealType(),source.getSemanticHash())):planAlias(source.getDate(),source.getMealType(),source.getSemanticHash());}
 private String planAlias(String date,String meal,String content){return hash(Arrays.asList("plan",date,meal,content));}
 private String hash(Object value){try{return WorkflowRequestHash.sha256(json.writeValueAsString(value));}catch(Exception e){throw new IllegalArgumentException("采购来源无效",e);}}
 private void lock(Long user){if(user==null||locks.lockUser(user)==null)throw new IllegalArgumentException("请先登录");}
 private void validateSlot(String date,String meal){MealConsumptionService.date(date);if(!Arrays.asList("breakfast","lunch","dinner").contains(meal))throw new IllegalArgumentException("采购餐次无效");}
}
