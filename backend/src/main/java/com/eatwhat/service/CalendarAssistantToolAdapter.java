package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CalendarAssistantToolAdapter implements AssistantCapabilityService.ActionExecutor,ControlledToolHarnessService.Extension {
 private final MealWorkspaceService workspaces;private final ControlledToolHarnessService harness;private final AssistantV4Store store;private final ObjectMapper json;
 private final ObjectProvider<AssistantV4TurnService> runner;private final ObjectProvider<CalendarSavedListener> listeners;
 public CalendarAssistantToolAdapter(MealWorkspaceService workspaces,ControlledToolHarnessService harness,AssistantV4Store store,ObjectMapper json,
   AssistantCapabilityService capabilities,ObjectProvider<AssistantV4TurnService> runner,ObjectProvider<CalendarSavedListener> listeners){
  this.workspaces=workspaces;this.harness=harness;this.store=store;this.json=json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,true).configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true);
  this.runner=runner;this.listeners=listeners;harness.registerExtension(this);capabilities.registerPreview("calendar_save",this);
 }
 public String tool(){return ControlledToolRegistry.SAVE_MEAL_TO_TARGET;}
 public TurnResult execute(Long user,WorkflowStep step,TurnScope scope){
  if(!"calendar_save".equals(step.getKind())||user==null||!user.equals(scope.getUserId()))throw new IllegalArgumentException("保存操作无效");
  CalendarSaveIntent intent=json.convertValue(step.getArguments(),CalendarSaveIntent.class);
  if(intent.getSourceWorkspaceId()==null)intent.setSourceWorkspaceId(scope.getWorkspaceId());
  if(!Objects.equals(intent.getSourceWorkspaceId(),scope.getWorkspaceId()))throw new IllegalArgumentException("只能保存当前对话的本餐");
  TurnRecord turn=store.turnRecord(user,scope.getTurnId());
  if(!Objects.equals(turn.getWorkspaceId(),scope.getWorkspaceId())||!Objects.equals(turn.getSessionId(),scope.getSessionId()))throw new IllegalArgumentException("当前餐不属于本次操作");
  ControlledToolTask task=store.withActiveParent(user,scope.getTurnId(),step.getStepId(),()->{
   MealWorkspace source=workspaces.get(user,intent.getSourceWorkspaceId());
   if(!Objects.equals(source.getRevision(),scope.getExpectedWorkspaceRevision())||!Objects.equals(source.getDraft().getPlanVersion(),scope.getExpectedPlanVersion()))throw new MealConsumptionService.VersionConflict("本餐已更新，请查看最新内容");
   return prepareCalendar(user,intent,step.getRequestId(),scope.getTurnId(),step.getStepId());
  });
  Card card=previewCard(task);PendingAction pending=new PendingAction();pending.setTaskId(task.id);pending.setStepId(step.getStepId());pending.setPreviewToken(task.previewToken);pending.setExpiresAt(task.expiresAt);
  TurnResult result=new TurnResult();result.setStatus("awaiting_confirmation");result.setReply("请确认这次安排");result.setWorkspaceRef(card.getWorkspaceRef());result.setPendingAction(pending);result.getCards().add(card);return result;
 }
 public ControlledToolTask prepareCalendar(Long user,CalendarSaveIntent intent,String requestId){return prepareCalendar(user,intent,requestId,null,null);}
 private ControlledToolTask prepareCalendar(Long user,CalendarSaveIntent intent,String requestId,String parent,String step){
  Map<String,Object> args=new LinkedHashMap<>();args.put("sourceWorkspaceId",intent.getSourceWorkspaceId());args.put("targetDate",intent.getTargetDate());args.put("targetMealType",intent.getTargetMealType());
  args.put("parentTurnId",parent);args.put("continuationStepId",step);return harness.previewExtension(user,tool(),args,requestId);
 }
 public Map<String,Object> bind(Long user,Map<String,Object> args){
  String source=(String)args.get("sourceWorkspaceId"),date=(String)args.get("targetDate"),meal=(String)args.get("targetMealType");
  MealContext target=new MealContext();target.setDate(date);target.setMealType(meal);MealWorkspaceRules.normalize(target);
  if(java.time.LocalDate.parse(date).getYear()<1)throw new IllegalArgumentException("目标日期无效");
  MealWorkspace w=workspaces.assistantSnapshot(user,source);
  if(!Arrays.asList("draft","planned").contains(w.getStatus())||w.getTaskId()!=null||w.getDraft().getDishes().isEmpty()||!MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())||!MealWorkspaceRules.understandsRequirements(w.getDraft(),w.getContext()))throw new IllegalArgumentException("请重新安排本餐后预览");
  Map<String,Object> linked=workspaces.linked(user,w,date,meal),b=new LinkedHashMap<>(args);
  b.put("workspaceRevision",w.getRevision());b.put("planVersion",w.getDraft().getPlanVersion());b.put("targetPlanRevision",linked.get("planRevision"));
  b.put("sourceDate",w.getContext().getDate());b.put("sourceMealType",w.getContext().getMealType());b.put("people",w.getContext().getPeople());
  b.put("contextHash",MealWorkspaceRules.contextFingerprint(w.getContext()));b.put("dishes",json.convertValue(w.getDraft().getDishes(),List.class));b.put("replacedPlan",linked.get("plan")==null?null:json.convertValue(linked.get("plan"),Map.class));
  Map<String,String> versions=new LinkedHashMap<>();w.getDraft().getDishes().forEach(d->versions.put(String.valueOf(d.getId()),d.getContentVersion()));b.put("dishContentVersions",versions);
  b.put("sourceContentHash",hash(b.get("dishes")));return b;
 }
 @SuppressWarnings("unchecked") public String summary(Map<String,Object> b){
  String names=((List<Map<String,Object>>)b.get("dishes")).stream().map(d->String.valueOf(d.get("name"))).collect(Collectors.joining("、"));
  Map<String,Object> old=(Map<String,Object>)b.get("replacedPlan");
  return "保存 "+b.get("targetDate")+" "+label((String)b.get("targetMealType"))+"，"+b.get("people")+" 人："+names+"。"+(old==null?"当前没有已保存安排。":"将替换原安排："+old.get("recipeName")+"。")+"保存计划不计入实际用餐。";
 }
 public Map<String,Object> execute(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index){
  String parent=(String)step.binding.get("parentTurnId"),stepId=(String)step.binding.get("continuationStepId");
  if(parent!=null)return store.withActiveParent(user,parent,stepId,()->{
   PendingAction pending=store.findTurn(user,parent).getPendingAction();
   if(pending==null||!Objects.equals(pending.getTaskId(),task.id))throw new MealConsumptionService.VersionConflict("请确认最新预览");
   return save(user,task,step,index);
  });
  return save(user,task,step,index);
 }
 private Map<String,Object> save(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index){
  Map<String,Object> current=bind(user,step.arguments);
  if(!hash(current).equals(hash(step.binding)))throw new MealConsumptionService.VersionConflict("本餐或目标安排已变化，请重新预览");
  WorkspaceRequest request=new WorkspaceRequest();request.setRequestId("harness-"+task.id+"-"+index);request.setExpectedWorkspaceRevision(number(step.binding,"workspaceRevision"));request.setPlanVersion(number(step.binding,"planVersion"));request.setExpectedPlanRevision(number(step.binding,"targetPlanRevision"));
  request.setTargetDate((String)step.binding.get("targetDate"));request.setTargetMealType((String)step.binding.get("targetMealType"));
  MealWorkspace saved=workspaces.mutate(user,(String)step.binding.get("sourceWorkspaceId"),"confirm",request);
  CalendarSavedReceipt receipt=new CalendarSavedReceipt();receipt.setTaskId(task.id);receipt.setParentTurnId((String)step.binding.get("parentTurnId"));receipt.setContinuationStepId((String)step.binding.get("continuationStepId"));
  receipt.setSourceWorkspaceId(saved.getId());receipt.setSourcePlanVersion(number(step.binding,"planVersion"));receipt.setSourceWorkspaceRevision(number(step.binding,"workspaceRevision"));receipt.setSourceDate((String)step.binding.get("sourceDate"));receipt.setSourceMealType((String)step.binding.get("sourceMealType"));receipt.setSourceContentHash((String)step.binding.get("sourceContentHash"));
  receipt.setTargetDate((String)saved.getConfirmation().get("date"));receipt.setTargetMealType((String)saved.getConfirmation().get("mealType"));receipt.setTargetPlanRevision(number(saved.getConfirmation(),"planRevision"));receipt.setReceiptRef("calendar:"+request.getRequestId());
  Card card=new Card();card.setId(task.id);card.setType("receipt");card.setTitle("安排已保存");card.setText(receipt.getTargetDate()+" "+label(receipt.getTargetMealType())+"，"+saved.getContext().getPeople()+" 人");card.setReceiptRef(receipt.getReceiptRef());card.setWorkspaceRef(WorkspaceAssistantToolAdapter.reference(saved));
  card.setData(facts(step.binding));card.getData().put("planRevision",receipt.getTargetPlanRevision());card.getData().put("workspaceRevision",saved.getRevision());card.getData().put("countsAsActual",false);
  if(receipt.getParentTurnId()!=null)store.completeWorkflowStep(user,receipt.getParentTurnId(),receipt.getContinuationStepId(),receipt.getReceiptRef(),card);
  Map<String,Object> result=json.convertValue(receipt,Map.class);result.put("executed",true);result.put("countsAsActual",false);result.put("card",json.convertValue(card,Map.class));return result;
 }
 public void afterCommit(Long user,ControlledToolTask task,ControlledToolTask.Step step){
  Map<String,Object> fields=new LinkedHashMap<>(step.result);fields.remove("executed");fields.remove("countsAsActual");fields.remove("card");CalendarSavedReceipt receipt=json.convertValue(fields,CalendarSavedReceipt.class);
  listeners.orderedStream().forEach(listener->listener.afterSaved(user,receipt));
  if(receipt.getParentTurnId()!=null){
   try{if("awaiting_confirmation".equals(store.turnRecord(user,receipt.getParentTurnId()).getStatus())){AssistantV4TurnService turns=runner.getIfAvailable();if(turns!=null)turns.resumeWorkflow(user,receipt.getParentTurnId());}}
   catch(org.springframework.web.server.ResponseStatusException missing){if(missing.getRawStatusCode()!=404)throw missing;}
  }
 }
 private Card previewCard(ControlledToolTask task){
  Map<String,Object> b=task.steps.get(0).binding;Card card=new Card();card.setId(task.id);card.setType("calendar_save");card.setTitle("确认保存安排");card.setText(task.summary);card.setTaskId(task.id);card.setPreviewToken(task.previewToken);card.setExpiresAt(task.expiresAt);card.setData(facts(b));
  WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId((String)b.get("sourceWorkspaceId"));ref.setWorkspaceRevision(number(b,"workspaceRevision"));ref.setPlanVersion(number(b,"planVersion"));card.setWorkspaceRef(ref);return card;
 }
 private Map<String,Object> facts(Map<String,Object> b){Map<String,Object> d=new LinkedHashMap<>();d.put("date",b.get("targetDate"));d.put("mealType",b.get("targetMealType"));d.put("people",b.get("people"));d.put("workspaceId",b.get("sourceWorkspaceId"));d.put("workspaceRevision",b.get("workspaceRevision"));d.put("planVersion",b.get("planVersion"));d.put("planRevision",b.get("targetPlanRevision"));return d;}
 private static Long number(Map<String,Object> b,String key){Object n=b.get(key);if(!(n instanceof Number))throw new IllegalArgumentException("缺少服务器版本");return ((Number)n).longValue();}
 private String hash(Object value){try{return WorkflowRequestHash.sha256(json.writeValueAsString(value));}catch(Exception e){throw new IllegalArgumentException("预览内容无效",e);}}
 private static String label(String meal){return "breakfast".equals(meal)?"早餐":"lunch".equals(meal)?"午餐":"晚餐";}
}
