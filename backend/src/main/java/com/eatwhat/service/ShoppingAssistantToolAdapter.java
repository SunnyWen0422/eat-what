package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantShoppingContract.*;
import com.eatwhat.dto.AssistantActionContract.CalendarSavedReceipt;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.util.*;

@Service
public class ShoppingAssistantToolAdapter implements AssistantCapabilityService.ActionExecutor,ControlledToolHarnessService.Extension {
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;
 private final AssistantCapabilityService capabilities;
 private final ShoppingProcurementScopeService scopes;
 private final ShoppingPreviewService previews;
 private final ShoppingListService lists;
 private final ControlledToolHarnessService harness;
 private final AssistantV4Store store;
 private final ObjectProvider<AssistantV4TurnService> runner;
 private final TransactionTemplate tx;
 private final ObjectMapper json;
 public ShoppingAssistantToolAdapter(ShoppingProcurementScopeService scopes,ShoppingPreviewService previews,ShoppingListService lists,
   ControlledToolHarnessService harness,AssistantV4Store store,AssistantCapabilityService capabilities,ObjectProvider<AssistantV4TurnService> runner,TransactionTemplate tx,ObjectMapper json){
  this.capabilities=capabilities;this.scopes=scopes;this.previews=previews;this.lists=lists;this.harness=harness;this.store=store;this.runner=runner;this.tx=tx;
  this.json=json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,true).configure(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS,true).configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true);
  harness.registerExtension(this);capabilities.registerPreview("shopping_preview",this);
 }
 public boolean enabled(){return capabilities.capabilities().isEnabled();}
 public String tool(){return "add_meal_shopping";}
 public ControlledToolTask prepareShopping(Long user,ShoppingIntent intent,String requestId){return harness.previewExtension(user,tool(),arguments(intent,null,null),requestId);}
 public TurnResult execute(Long user,WorkflowStep step,TurnScope scope){
  if(!"shopping_preview".equals(step.getKind())||user==null||!user.equals(scope.getUserId()))throw new IllegalArgumentException("采购操作无效");
  ShoppingIntent intent=json.convertValue(step.getArguments(),ShoppingIntent.class);
  if(intent.getSourceRef()==null)throw new IllegalArgumentException("缺少采购来源");
  if("draft".equals(intent.getSourceRef().getKind())&&!Objects.equals(scope.getWorkspaceId(),intent.getSourceRef().getWorkspaceId()))throw new IllegalArgumentException("只能从本次对话的本餐准备采购");
  // A compound workflow derives its target only from the prior successful Java save receipt.
  WorkflowContinuation continuation=store.continuation(user,scope.getTurnId());
  if(continuation!=null)for(WorkflowStep dependency:continuation.getSteps())if(step.getDependsOn().contains(dependency.getStepId())&&"calendar_save".equals(dependency.getKind())){
   ControlledToolTask calendar=harness.byRequest(user,dependency.getRequestId());
   if(calendar==null||calendar.steps.size()!=1||!"completed".equals(calendar.steps.get(0).status)||!Objects.equals(dependency.getReceiptRef(),calendar.steps.get(0).result.get("receiptRef")))throw new IllegalStateException("请先恢复已保存安排的回执");
   Map<String,Object> fields=new LinkedHashMap<>(calendar.steps.get(0).result);fields.remove("executed");fields.remove("countsAsActual");fields.remove("reviewBasis");fields.remove("reviewFromDate");fields.remove("card");
   CalendarSavedReceipt receipt=json.convertValue(fields,CalendarSavedReceipt.class);scopes.afterSaved(user,receipt);
   ShoppingSourceRef ref=new ShoppingSourceRef();ref.setKind("plan");ref.setDate(receipt.getTargetDate());ref.setMealType(receipt.getTargetMealType());intent.setSourceRef(ref);
  }
  ControlledToolTask task=store.withActiveParent(user,scope.getTurnId(),step.getStepId(),()->harness.previewExtension(user,tool(),arguments(intent,scope.getTurnId(),step.getStepId()),step.getRequestId()));
  TurnResult result=new TurnResult();result.setStatus("awaiting_confirmation");result.setReply("请核对要准备的食材");result.setPendingAction(pending(task,step.getStepId()));Card card=previewCard(task);result.getCards().add(card);result.setWorkspaceRef(card.getWorkspaceRef());return result;
 }
 private Map<String,Object> arguments(ShoppingIntent intent,String parent,String step){
  if(intent==null||intent.getSourceRef()==null)throw new IllegalArgumentException("缺少采购来源");
  Map<String,Object> args=json.convertValue(intent,new TypeReference<Map<String,Object>>(){});args.put("parentTurnId",parent);args.put("continuationStepId",step);return args;
 }
 public Map<String,Object> bind(Long user,Map<String,Object> args){
  ShoppingSourceRef ref=json.convertValue(args.get("sourceRef"),ShoppingSourceRef.class);ResolvedSource source=scopes.resolveSource(user,ref);String scope=scopes.resolveScope(user,source);
  ShoppingListResponse list=lists.getList(user,"all");
  List<String> selected=strings(args.get("selectedSourceKeys"),1000,200),excluded=strings(args.get("excludedOwnedIngredients"),100,100);
  Set<String> allKeys=new HashSet<>(),allNames=new HashSet<>();List<Map<String,Object>> rows=new ArrayList<>();List<ShoppingDishRequest> groups=new ArrayList<>();
  for(int occurrence=0;occurrence<source.getDishes().size();occurrence++){
   Long dishId=source.getDishes().get(occurrence).getId();ShoppingPreviewRequest request=new ShoppingPreviewRequest();request.setDishIds(Collections.singletonList(dishId));request.setTargetPeople(source.getPeople()==null?null:BigDecimal.valueOf(source.getPeople()));
   ShoppingPreviewResponse preview=previews.createPreview(user,request);
   if(preview.getDishes().size()!=1||!dishId.equals(preview.getDishes().get(0).getDishId()))throw new MealConsumptionService.VersionConflict("菜谱食材来源已变化");
   String selection="meal-"+scope+"-"+occurrence;
   ShoppingDishRequest group=new ShoppingDishRequest();group.setSelectionKey(selection);group.setSourceDate(source.getDate());group.setSourceMealType(source.getMealType());group.setTargetPeople(source.getPeople()==null?null:BigDecimal.valueOf(source.getPeople()));
   for(ShoppingPreviewItemDTO fact:preview.getDishes().get(0).getItems()){
    String key=selection+"-"+fact.getSourceLineNo();allKeys.add(key);allNames.add(fact.getCanonicalName());allNames.add(fact.getDisplayName());
    boolean include=(selected==null||selected.contains(key))&&(excluded==null||(!excluded.contains(fact.getCanonicalName())&&!excluded.contains(fact.getDisplayName())));
    ShoppingPreviewItemDTO existing=existing(list,selection,fact.getSourceLineNo());
    ShoppingPreviewItemDTO shown=existing!=null&&(existing.isUserOverride()||existing.isChecked())?existing:fact;
    Map<String,Object> row=new LinkedHashMap<>();row.put("sourceKey",key);row.put("name",shown.getDisplayName());row.put("quantity",shown.getQuantityValue());row.put("quantityText",shown.isUserOverride()&&shown.getQuantityText()!=null&&!shown.getQuantityText().trim().isEmpty()?shown.getQuantityText():shown.getQuantityValue()==null?"按需":shown.getQuantityText());row.put("unit",shown.getUnitCode());row.put("price",null);row.put("selected",include);row.put("checked",shown.isChecked());row.put("calculationStatus",shown.getCalculationStatus());row.put("sourceDishId",dishId);row.put("sourceLineNo",fact.getSourceLineNo());rows.add(row);
    if(include)group.getItems().add(fact);
    if(!include&&existing!=null&&(existing.isUserOverride()||existing.isChecked()))throw new MealConsumptionService.VersionConflict("已购或手动调整的食材需在清单中确认移除");
   }
   if(!group.getItems().isEmpty())groups.add(group);
  }
  if(selected!=null&&!allKeys.containsAll(selected))throw new IllegalArgumentException("选中的食材不属于本次预览");
  if(excluded!=null&&!allNames.containsAll(excluded))throw new IllegalArgumentException("排除的食材不属于本餐");
  if(groups.isEmpty())throw new IllegalArgumentException("请至少保留一项食材");
  Map<String,Object> binding=new LinkedHashMap<>(args);binding.put("source",json.convertValue(source,Map.class));binding.put("purchaseScopeId",scope);binding.put("expectedListVersion",list.getVersion());binding.put("groups",json.convertValue(groups,List.class));binding.put("items",json.convertValue(rows,List.class));return binding;
 }
 private ShoppingPreviewItemDTO existing(ShoppingListResponse list,String selection,Integer line){for(ShoppingDishDTO group:list.getDishes())if(selection.equals(group.getSelectionKey()))for(ShoppingPreviewItemDTO item:group.getItems())if(Objects.equals(line,item.getSourceLineNo()))return item;return null;}
 public String summary(Map<String,Object> b){Map<String,Object> source=map(b.get("source"));return source.get("date")+" "+label((String)source.get("mealType"))+"，"+source.get("people")+" 人，请核对选中的食材。";}
 public Map<String,Object> execute(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index){
  String parent=(String)step.binding.get("parentTurnId"),stepId=(String)step.binding.get("continuationStepId");
  if(parent==null)return add(user,task,step,index);
  return store.withActiveParent(user,parent,stepId,()->{PendingAction pending=store.findTurn(user,parent).getPendingAction();if(pending==null||!task.id.equals(pending.getTaskId()))throw new MealConsumptionService.VersionConflict("采购预览已更新，请使用最新卡片");return add(user,task,step,index);});
 }
 private Map<String,Object> add(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index){
  return ExperienceMetrics.confirmation(metrics,()->addConfirmed(user,task,step,index),r->((Number)r.get("addedItemCount")).longValue()+((Number)r.get("mergedItemCount")).longValue());
 }
 private Map<String,Object> addConfirmed(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index){
  ResolvedSource confirmed=json.convertValue(step.binding.get("source"),ResolvedSource.class);
  confirmed.setDishes(com.eatwhat.util.DishSnapshotReader.convertDishes(json,map(step.binding.get("source")).get("dishes")));
  scopes.lockForConfirmation(user,confirmed);
  if(!hash(bind(user,step.arguments)).equals(hash(step.binding)))throw new MealConsumptionService.VersionConflict("本餐、菜谱或清单已变化，请重新预览");
  ShoppingBatchAddRequest request=new ShoppingBatchAddRequest();request.setRequestId("harness-"+task.id+"-"+index);request.setPreviewId(task.id);request.setExpectedListVersion(((Number)step.binding.get("expectedListVersion")).longValue());request.setDishes(json.convertValue(step.binding.get("groups"),new TypeReference<List<ShoppingDishRequest>>(){}));request.setTargetPeople(request.getDishes().get(0).getTargetPeople());
  ShoppingSyncResponse receipt;
  try{receipt=lists.batchAdd(user,request);}catch(ShoppingListService.VersionConflictException changed){throw new MealConsumptionService.VersionConflict("清单已变化，请重新预览");}
  String ref="shopping:"+request.getRequestId();
  Card card=new Card();card.setId(task.id);card.setType("receipt");card.setTitle("采购清单已更新");card.setReceiptRef(ref);card.setData(facts(step.binding));card.getData().put("addedItemCount",receipt.getAddedItemCount());card.getData().put("mergedItemCount",receipt.getMergedItemCount());card.getData().put("idempotent",receipt.isIdempotent());card.setText("已加入采购清单");
  String parent=(String)step.binding.get("parentTurnId");if(parent!=null)store.completeWorkflowStep(user,parent,(String)step.binding.get("continuationStepId"),ref,card);
  Map<String,Object> result=new LinkedHashMap<>();result.put("executed",true);result.put("receiptRef",ref);result.put("addedItemCount",receipt.getAddedItemCount());result.put("mergedItemCount",receipt.getMergedItemCount());result.put("idempotent",receipt.isIdempotent());result.put("countsAsActual",false);result.put("listVersion",receipt.getList().getVersion());result.put("card",json.convertValue(card,Map.class));return result;
 }
 public void afterCommit(Long user,ControlledToolTask task,ControlledToolTask.Step step){String parent=(String)step.binding.get("parentTurnId");if(parent!=null){AssistantV4TurnService turns=runner.getIfAvailable();if(turns!=null)turns.resumeWorkflow(user,parent);}}
 public ControlledToolTask repreview(Long user,String oldId,RepreviewRequest request){
  if(request==null)throw new IllegalArgumentException("缺少采购选择");
  return tx.execute(t->{
   scopes.lockAccount(user);
   ControlledToolTask old=harness.get(user,oldId);if(old.steps.size()!=1||!tool().equals(old.steps.get(0).tool))throw new IllegalArgumentException("采购预览无效");
   Map<String,Object> args=new LinkedHashMap<>(old.steps.get(0).arguments);args.put("repreviewOf",oldId);
   if(request.getSelectedSourceKeys()!=null)args.put("selectedSourceKeys",request.getSelectedSourceKeys());
   if(request.getExcludedOwnedIngredients()!=null)args.put("excludedOwnedIngredients",request.getExcludedOwnedIngredients());
   // Check the original renewal key first: replay succeeds even though that old token is now invalidated.
   if(harness.byRequest(user,request.getRequestId())!=null)return harness.previewExtension(user,tool(),args,request.getRequestId());
   if(old.steps.stream().anyMatch(s->"completed".equals(s.status))||"PREVIEW_REPLACED".equals(old.errorCode))throw new MealConsumptionService.VersionConflict("请使用当前采购预览");
   String parent=(String)args.get("parentTurnId"),step=(String)args.get("continuationStepId");
   java.util.function.Supplier<ControlledToolTask> work=()->{ControlledToolTask fresh=harness.previewExtension(user,tool(),args,request.getRequestId());harness.invalidateExtensionPreview(user,oldId);if(parent!=null)store.replacePendingAction(user,parent,step,oldId,pending(fresh,step),previewCard(fresh));return fresh;};
   return parent==null?work.get():store.withRepreviewParent(user,parent,step,oldId,work);
  });
 }
 public Card previewCard(ControlledToolTask task){Map<String,Object> b=task.steps.get(0).binding;Card card=new Card();card.setId(task.id);card.setType("shopping_preview");card.setTitle("确认准备食材");card.setText(task.summary);card.setTaskId(task.id);card.setPreviewToken(task.previewToken);card.setExpiresAt(task.expiresAt);card.setData(facts(b));Map<String,Object> source=map(b.get("source"));if(source.get("workspaceId")!=null){WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId((String)source.get("workspaceId"));ref.setWorkspaceRevision(((Number)source.get("workspaceRevision")).longValue());ref.setPlanVersion(((Number)source.get("planVersion")).longValue());card.setWorkspaceRef(ref);}return card;}
 private Map<String,Object> facts(Map<String,Object> b){Map<String,Object> s=map(b.get("source")),data=new LinkedHashMap<>();data.put("action","shopping_preview");for(String key:Arrays.asList("date","mealType","people","workspaceId","workspaceRevision","planVersion","planRevision"))if(s.get(key)!=null)data.put(key,s.get(key));data.put("sourceRef",b.get("sourceRef"));data.put("items",b.get("items"));return data;}
 private PendingAction pending(ControlledToolTask task,String step){PendingAction p=new PendingAction();p.setTaskId(task.id);p.setStepId(step);p.setPreviewToken(task.previewToken);p.setExpiresAt(task.expiresAt);return p;}
 private List<String> strings(Object value,int max,int length){if(value==null)return null;if(!(value instanceof List)||((List<?>)value).size()>max)throw new IllegalArgumentException("采购选择无效");List<String> result=new ArrayList<>();for(Object item:(List<?>)value){if(!(item instanceof String)||((String)item).isEmpty()||((String)item).length()>length||result.contains(item))throw new IllegalArgumentException("采购选择无效");result.add((String)item);}return result;}
 @SuppressWarnings("unchecked") private Map<String,Object> map(Object value){return (Map<String,Object>)value;}
 private String hash(Object value){try{return WorkflowRequestHash.sha256(json.writeValueAsString(normalizeNumbers(value)));}catch(Exception e){throw new IllegalArgumentException("采购预览无效",e);}}
 private Object normalizeNumbers(Object value){
  if(value instanceof Number){BigDecimal n=new BigDecimal(value.toString()).stripTrailingZeros();return n.scale()<0?n.setScale(0):n;}
  if(value instanceof Map){Map<String,Object> out=new TreeMap<>();for(Map.Entry<?,?> e:((Map<?,?>)value).entrySet())out.put(String.valueOf(e.getKey()),normalizeNumbers(e.getValue()));return out;}
  if(value instanceof List){List<Object> out=new ArrayList<>();for(Object item:(List<?>)value)out.add(normalizeNumbers(item));return out;}return value;
 }
 private String label(String meal){return "breakfast".equals(meal)?"早餐":"lunch".equals(meal)?"午餐":"晚餐";}
}
