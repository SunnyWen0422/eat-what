package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.*;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class WorkspaceAssistantToolAdapter implements AssistantCapabilityService.ActionExecutor {
 private final MealWorkspaceService workspaces; private final AssistantV4Store store; private final ObjectMapper json;
 public WorkspaceAssistantToolAdapter(MealWorkspaceService workspaces,AssistantV4Store store,ObjectMapper json,AssistantCapabilityService capabilities){
  this.workspaces=workspaces;this.store=store;this.json=json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,true);
  capabilities.registerDraft("draft_update",this);
 }
 public TurnResult execute(Long user,WorkflowStep step,TurnScope scope){
  if(!"draft_update".equals(step.getKind()))throw new IllegalArgumentException("操作类型无效");
  validateArguments(json.valueToTree(step.getArguments()));
  DraftIntent intent=json.convertValue(step.getArguments(),DraftIntent.class);
  TurnBinding binding=new TurnBinding();binding.setScope(scope);binding.setStepId(step.getStepId());binding.setRequestId(step.getRequestId());
  MealWorkspace saved=applyDraft(user,intent,binding);
  WorkspaceRef ref=reference(saved);Card card=new Card();card.setId(step.getRequestId());card.setType(saved.getDraft().getDishes().isEmpty()?"receipt":"menu");card.setTitle("本餐已调整");card.setText(saved.getMessage());
  card.setReceiptRef("workspace:"+saved.getId()+":"+step.getRequestId());card.setWorkspaceRef(ref);
  card.getData().put("people",saved.getContext().getPeople());card.getData().put("date",saved.getContext().getDate());card.getData().put("mealType",saved.getContext().getMealType());
  List<Map<String,Object>> dishes=new ArrayList<>();
  saved.getDraft().getDishes().forEach(d->{Map<String,Object> item=new LinkedHashMap<>();item.put("id",d.getId());item.put("name",d.getName());item.put("type",d.getType());item.put("image",d.getImage());item.put("cookMinutes",d.getCookMinutes());dishes.add(item);});
  card.getData().put("dishes",dishes);card.getData().put("canUndo",!saved.getDraft().getHistory().isEmpty());
  TurnResult result=new TurnResult();result.setStatus("completed");result.setReply("本餐已调整，可以撤销最近一次修改");result.setWorkspaceRef(ref);result.getCards().add(card);return result;
 }
 public MealWorkspace applyDraft(Long user,DraftIntent intent,TurnBinding binding){
  TurnScope scope=binding.getScope();
  if(user==null||scope==null||!user.equals(scope.getUserId()))throw new IllegalArgumentException("请先登录");
  return store.withActiveParent(user,scope.getTurnId(),binding.getStepId(),()->{
   TurnRecord turn=store.turnRecord(user,scope.getTurnId());
   if(!Objects.equals(turn.getSessionId(),scope.getSessionId())||!Objects.equals(turn.getWorkspaceId(),scope.getWorkspaceId()))throw new IllegalArgumentException("当前餐不属于本次操作");
   if(!Objects.equals(store.sessionState(user,scope.getSessionId()).getWorkspaceId(),scope.getWorkspaceId()))throw new IllegalArgumentException("工作区不属于本次对话");
   return workspaces.applyAssistantDraft(user,scope.getWorkspaceId(),scope.getExpectedWorkspaceRevision(),scope.getExpectedPlanVersion(),new ValidatedAssistantDraft(intent,scope.getAuthorizedDishIds(),scope.getSessionId(),binding.getStepId()),binding.getRequestId(),scope.getTurnId());
  });
 }
 static WorkspaceRef reference(MealWorkspace w){WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(w.getId());ref.setWorkspaceRevision(w.getRevision());ref.setPlanVersion(w.getDraft().getPlanVersion());return ref;}
 static void validateArguments(JsonNode n){
  for(String key:Arrays.asList("targetDishId","replacementDishId"))if(n.has(key))positiveInteger(n.get(key));
  for(String key:Arrays.asList("selectedDishIds","keepDishIds","releaseDishIds"))if(n.has(key)){JsonNode list=n.get(key);if(!list.isArray()||list.size()>10)throw new IllegalArgumentException("菜品编号无效");for(JsonNode id:list)positiveInteger(id);}
  JsonNode patch=n.get("contextPatch");if(patch!=null){
   AssistantV4Contract.fields(patch,"people","counts","compositionMode","criteria","totalCookMinutes","requirements","ownedIngredients");
   if(patch.has("people"))positiveInteger(patch.get("people"));
   if(patch.hasNonNull("totalCookMinutes"))positiveInteger(patch.get("totalCookMinutes"));
   if(patch.has("counts")){JsonNode counts=patch.get("counts");AssistantV4Contract.fields(counts,"meat","veg","soup","staple","dessert","side");counts.elements().forEachRemaining(value->{if(!value.isIntegralNumber()||value.longValue()<0||value.longValue()>10)throw new IllegalArgumentException("菜数无效");});}
   if(patch.has("criteria"))criteria(patch.get("criteria"));
  }
  if(n.has("targetConstraints"))criteria(n.get("targetConstraints"));
 }
 private static void criteria(JsonNode c){AssistantV4Contract.fields(c,"cuisineCodes","includeTagCodes","excludeTagCodes","excludedIngredients","maxCookMinutes");if(c.hasNonNull("maxCookMinutes"))positiveInteger(c.get("maxCookMinutes"));}
 private static void positiveInteger(JsonNode value){if(value==null||!value.isIntegralNumber()||!value.canConvertToLong()||value.longValue()<1)throw new IllegalArgumentException("菜品编号或数量无效");}
}
