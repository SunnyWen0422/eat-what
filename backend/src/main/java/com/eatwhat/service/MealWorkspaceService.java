package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class MealWorkspaceService {
    private final MealWorkspaceMapper db;
    private final MealConsumptionMapper locks;
    private final RecipeRecordMapper plans;
    private final RecipeRecordService planService;
    private final MealWorkspacePlanner planner;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    public MealWorkspaceService(MealWorkspaceMapper db,MealConsumptionMapper locks,RecipeRecordMapper plans,
            RecipeRecordService planService,MealWorkspacePlanner planner,ObjectMapper json,TransactionTemplate tx) {
        this.db=db;this.locks=locks;this.plans=plans;this.planService=planService;this.planner=planner;this.json=json;this.tx=tx;
    }
    private String encode(Object o) {try{return json.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException("工作区保存失败",e);}}
    private <T> T decode(String value,Class<T> type) {try{return json.readValue(value,type);}catch(Exception e){throw new IllegalStateException("工作区读取失败",e);}}
    private void lock(Long user) {if(user==null||locks.lockUser(user)==null)throw new IllegalArgumentException("用户不存在");}
    private MealWorkspace read(WorkspaceRow row) {if(row==null)return null;MealWorkspace w=decode(row.getStateJson(),MealWorkspace.class);if(row.getRevision()!=null)w.setRevision(row.getRevision());return w;}
    /** Owner-scoped read for server-side assistant context and session binding. */
    public MealWorkspace get(Long user,String id) {
        if(user==null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED);
        MealWorkspace w=read(db.find(id,user));
        if(w==null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"工作区不存在或不可访问");
        return w;
    }
    public MealWorkspace current(Long user,String date,String meal) {
        MealContext c=new MealContext();c.setDate(date);c.setMealType(meal);MealWorkspaceRules.normalize(c);
        return read(db.slot(user,date,meal));
    }
    public MealWorkspace assistantSnapshot(Long user,String id){
        return tx.execute(status->{lock(user);MealWorkspace w=get(user,id);if(w.getDraft().getDishes().isEmpty())throw new IllegalArgumentException("请先生成方案");planner.lockAndValidateAssistant(user,w,w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toList()));return w;});
    }
    public Map<String,Object> linked(Long user,MealWorkspace w) {
        return linked(user,w,w==null?null:w.getContext().getDate(),w==null?null:w.getContext().getMealType());
    }
    public Map<String,Object> linked(Long user,MealWorkspace w,String date,String meal) {
        Map<String,Object> result=new LinkedHashMap<>();result.put("workspace",w);
        if(date!=null && meal!=null) {
            RecipeRecord plan=plans.findSlot(user,date,meal);
            result.put("plan",plan!=null&&!Boolean.TRUE.equals(plan.getIsDeleted())?plan:null);
            result.put("planRevision",plan==null?0L:plan.getRevision());
            MealConsumption actual=locks.find(user,date,meal);
            if(actual!=null && actual.getActualDishesJson()!=null)try{actual.setActualDishes(json.readValue(actual.getActualDishesJson(),new com.fasterxml.jackson.core.type.TypeReference<List<Map<String,Object>>>(){}));}catch(Exception e){throw new IllegalStateException("实际记录快照无法读取",e);}
            result.put("actual",actual);
        }
        return result;
    }
    public MealWorkspace create(Long user,WorkspaceRequest request) {
        validateRequest(request);MealContext c=MealWorkspaceRules.normalize(json.convertValue(request.getContext(),MealContext.class));
        return tx.execute(status->{
            lock(user);String hash=hash("create",null,request);MealWorkspace replay=replay(user,request.getRequestId(),hash);if(replay!=null)return replay;
            MealWorkspace w=read(db.slot(user,c.getDate(),c.getMealType()));
            if(w==null) {
                if(request.getExpectedWorkspaceRevision()!=0L)throw conflict("工作区版本无效");
                w=new MealWorkspace();w.setId(UUID.randomUUID().toString());w.setContext(c);
                db.create(w.getId(),user,c.getDate(),c.getMealType(),encode(w));
            }
            receipt(user,request.getRequestId(),hash,w);return w;
        });
    }
    public MealWorkspace mutate(Long user,String id,String operation,WorkspaceRequest request) {
        validateRequest(request);
        return tx.execute(status->{
            lock(user);String hash=hash(operation,id,request);MealWorkspace replay=replay(user,request.getRequestId(),hash);if(replay!=null)return replay;
            MealWorkspace w=read(db.find(id,user));if(w==null)throw new IllegalArgumentException("工作区不存在或不可访问");
            if(!Objects.equals(w.getRevision(),request.getExpectedWorkspaceRevision()))throw conflict("本餐已在另一处更新，请查看最新内容");
            long before=w.getRevision();String command=request.getCommand();
            w.setSuggestedTarget(null);
            if("context".equals(operation)) {
                MealContext c=MealWorkspaceRules.normalize(json.convertValue(request.getContext(),MealContext.class));
                if(!Objects.equals(c.getDate(),w.getContext().getDate())||!Objects.equals(c.getMealType(),w.getContext().getMealType()))throw new IllegalArgumentException("请切换目标工作区后修改条件");
                db.cancel(id,user,w.getTaskId());w.setTaskId(null);w.getDraft().setRequirementsFingerprint(null);w.setContext(c);w.setStatus(w.getDraft().getDishes().isEmpty()?"empty":"needs_regeneration");w.setMessage("本餐条件已保存，重新安排后生效");
            } else {
                if(!Objects.equals(w.getDraft().getPlanVersion(),request.getPlanVersion()))throw conflict("方案版本已更新");
                if("confirm".equals(operation)) confirm(user,w,request);
                else if("cancel".equals(command)) {db.cancel(id,user,w.getTaskId());w.setTaskId(null);w.setStatus(w.getDraft().getDishes().isEmpty()?"empty":MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())?"draft":"needs_regeneration");w.setMessage("已停止，原方案已保留");}
                else if(Arrays.asList("keep","release","undo").contains(command)) {
                    db.cancel(id,user,w.getTaskId());w.setTaskId(null);
                    if("undo".equals(command))undoDraft(user,w,request.getReleaseLegacyLocks());
                    else w.setDraft(MealWorkspaceRules.command(w.getDraft(),command,request.getDishId(),null,request.getReleaseLegacyLocks()));
                    w.setStatus(MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())?"draft":"needs_regeneration");w.setMessage("条件已变化时需要重新安排");
                } else if(Arrays.asList("generate","regenerate","replace","select").contains(command)) {
                    w.setDraft(MealWorkspaceRules.prepareInteraction(w.getDraft(),command,request.getReleaseLegacyLocks()));
                    db.cancel(id,user,w.getTaskId());WorkspaceTask task=new WorkspaceTask();task.setId(UUID.randomUUID().toString());task.setWorkspaceId(id);task.setUserId(user);task.setBaseRevision(before+1);
                    Map<String,Object> input=new LinkedHashMap<>();input.put("workspace",w);input.put("request",request);task.setInputJson(encode(input));db.task(task);
                    w.setTaskId(task.getId());w.setStatus("generating");w.setMessage("正在安排本餐");
                } else throw new IllegalArgumentException("工作区操作无效");
            }
            w.setRevision(before+1);if(db.save(id,user,w.getRevision(),before,encode(w))!=1)throw conflict("工作区已更新");
            receipt(user,request.getRequestId(),hash,w);return w;
        });
    }
    private void confirm(Long user,MealWorkspace w,WorkspaceRequest request) {
        if("needs_regeneration".equals(w.getStatus()) || !MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext()))throw new IllegalArgumentException("条件已更改，请重新安排后确认");
        if(!MealWorkspaceRules.understandsRequirements(w.getDraft(),w.getContext()))throw new IllegalArgumentException("本餐文字限制尚未校验，请重新安排");
        if("generating".equals(w.getStatus()))throw conflict("请等待当前安排完成");
        if(request.getExpectedPlanRevision()==null||request.getExpectedPlanRevision()<0)throw new IllegalArgumentException("请提供目标安排版本");
        if(w.getDraft().getDishes().isEmpty())throw new IllegalArgumentException("请先生成方案");
        String targetDate=w.getContext().getDate(),targetMeal=w.getContext().getMealType();
        if(request.getTargetDate()!=null || request.getTargetMealType()!=null) {
            if(request.getTargetDate()==null || request.getTargetMealType()==null)throw new IllegalArgumentException("请同时指定目标日期和餐次");
            targetDate=request.getTargetDate();targetMeal=request.getTargetMealType();
            if(!targetDate.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || MealConsumptionService.date(targetDate).getYear()<1)throw new IllegalArgumentException("请指定有效目标日期");
            if(!Arrays.asList("breakfast","lunch","dinner").contains(targetMeal))throw new IllegalArgumentException("目标餐次无效");
        }
        RecipeRecord slot=plans.findSlot(user,targetDate,targetMeal);long current=slot==null?0:slot.getRevision();
        if(current!=request.getExpectedPlanRevision())throw conflict("原安排已更新，请重新查看替换内容");
        // Validate current ownership and hard restrictions again at the authoritative write boundary.
        List<Long> ids=w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        planner.lockAndValidate(user,w,ids);
        RecipeRecord plan=new RecipeRecord();plan.setUserId(user);plan.setRecordDateString(targetDate);plan.setMealType(targetMeal);plan.setTargetPeople(w.getContext().getPeople());
        plan.setRecipeName(w.getDraft().getDishes().stream().map(Dish::getName).collect(Collectors.joining("、")));plan.setDishIds(ids);plan.setIsManual(0);plan.setExpectedRevision(current);
        planService.saveWorkspaceRecipeRecord(plan,w.getDraft().getDishes());
        Map<String,Object> receipt=new LinkedHashMap<>();receipt.put("requestId",request.getRequestId());receipt.put("planVersion",w.getDraft().getPlanVersion());receipt.put("planRevision",current+1);receipt.put("date",targetDate);receipt.put("mealType",targetMeal);
        if(w.getConfirmation()==null&&!w.getDraft().isAdjustedBeforeConfirmation())db.event(WorkflowRequestHash.sha256(user+"|first_accept|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"first_accepted",w.getDraft().getSource());
        w.setConfirmation(receipt);w.setStatus("planned");w.setMessage("已保存安排，可以查看做法或准备采购");
        db.event(WorkflowRequestHash.sha256(user+"|accepted|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"accepted",w.getDraft().getSource());
        db.event(WorkflowRequestHash.sha256(user+"|plan|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"plan_saved",w.getDraft().getSource());
    }
    private void undoDraft(Long user,MealWorkspace w,Boolean releaseLocks) {
        PlanDraft restored=MealWorkspaceRules.command(w.getDraft(),"undo",null,null,releaseLocks);
        boolean completeContext=restored.getContextSnapshot()!=null;
        if(restored.getContextSnapshot()!=null){
            w.setContext(MealWorkspaceRules.normalize(json.convertValue(restored.getContextSnapshot(),MealContext.class)));
            restored.setContextSnapshot(null);
            restored.setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));
        }
        w.setDraft(restored);
        if(completeContext&&!restored.getDishes().isEmpty())planner.validateRestoredDraft(user,w,true);
    }
    /** Caller is the authenticated adapter inside the active turn transaction. No legacy generation is dispatched. */
    public MealWorkspace applyAssistantDraft(Long user,String id,Long expectedRevision,Long expectedPlanVersion,
            AssistantActionContract.ValidatedAssistantDraft validated,String requestId,String turnId) {
        RequestIdValidator.requireValid(requestId);
        return tx.execute(status->{
            lock(user);
            AssistantActionContract.DraftIntent intent=validated.intent;
            String hash=hash("assistant:"+turnId,id,intent);
            MealWorkspace replay=replay(user,requestId,hash);
            if(replay!=null){MealWorkspace current=get(user,id);return Objects.equals(current.getRevision(),replay.getRevision())?current:replay;}
            MealWorkspace w=get(user,id);
            if(!Objects.equals(w.getRevision(),expectedRevision)||!Objects.equals(w.getDraft().getPlanVersion(),expectedPlanVersion))throw conflict("本餐已更新，请查看最新内容");
            if(!Arrays.asList("generate","regenerate","adjust","undo").contains(intent.getOperation()))throw new IllegalArgumentException("草稿操作无效");
            MealContext originalContext=json.convertValue(w.getContext(),MealContext.class);PlanDraft original=MealWorkspaceRules.copy(w.getDraft());
            if("undo".equals(intent.getOperation())) {
                if(intent.getContextPatch()!=null||intent.getTargetDishId()!=null||intent.getReplacementDishId()!=null||intent.getTargetConstraints()!=null||intent.getSelectedDishIds()!=null||intent.getKeepDishIds()!=null||intent.getReleaseDishIds()!=null)throw new IllegalArgumentException("撤销不能同时修改其他内容");
                boolean completeContext=!original.getHistory().isEmpty()&&original.getHistory().get(original.getHistory().size()-1).getContextSnapshot()!=null;
                undoDraft(user,w,false);
                if(!completeContext&&!w.getDraft().getDishes().isEmpty())planner.validateRestoredDraft(user,w,false);
            } else {
                Set<Long> currentIds=original.getDishes().stream().map(Dish::getId).collect(Collectors.toCollection(LinkedHashSet::new));
                Set<Long> locks=new LinkedHashSet<>(original.getLockedDishIds());
                for(Long dish:orEmpty(intent.getReleaseDishIds())){if(!currentIds.contains(dish))throw new IllegalArgumentException("解除保留的菜不在当前餐");locks.remove(dish);}
                for(Long dish:orEmpty(intent.getKeepDishIds())){if(!currentIds.contains(dish))throw new IllegalArgumentException("保留的菜不在当前餐");locks.add(dish);}
                MealContext context=json.convertValue(originalContext,MealContext.class);
                if(intent.getContextPatch()!=null){
                    Set<String> allowed=new HashSet<>(Arrays.asList("people","counts","compositionMode","criteria","totalCookMinutes","requirements","ownedIngredients"));
                    if(!allowed.containsAll(intent.getContextPatch().keySet()))throw new IllegalArgumentException("本餐条件字段无效");
                    Map<String,Object> merged=json.convertValue(context,Map.class);merged.putAll(intent.getContextPatch());
                    if(intent.getContextPatch().containsKey("criteria")){
                        Object patch=intent.getContextPatch().get("criteria");if(!(patch instanceof Map))throw new IllegalArgumentException("筛选条件无效");
                        Map<String,Object> criteria=json.convertValue(originalContext.getCriteria(),Map.class);criteria.putAll((Map<String,Object>)patch);merged.put("criteria",criteria);
                    }
                    context=json.convertValue(merged,MealContext.class);MealWorkspaceRules.normalize(context);
                    // Uninterpreted text cannot be erased or claimed understood by a model flag.
                    if(!Objects.equals(context.getRequirements(),originalContext.getRequirements())&&(!originalContext.getRequirements().trim().isEmpty()||!context.getRequirements().trim().isEmpty()))throw new IllegalArgumentException("请先将文字限制明确为筛选条件");
                    if(!context.getCriteria().getExcludedIngredients().containsAll(originalContext.getCriteria().getExcludedIngredients())||!context.getCriteria().getExcludeTagCodes().containsAll(originalContext.getCriteria().getExcludeTagCodes()))throw new IllegalArgumentException("本餐忌口仍然有效，不能放宽已设置的限制");
                    if(!originalContext.getRequirements().trim().isEmpty()&&!preservesInterpretedLimits(originalContext,context))throw new IllegalArgumentException("文字限制仍然有效，不能放宽已校验条件");
                }
                if(!MealWorkspaceRules.understandsRequirements(original,context))throw new IllegalArgumentException("本餐文字限制尚未校验，请先明确筛选条件");
                boolean contextChanged=!MealWorkspaceRules.contextFingerprint(originalContext).equals(MealWorkspaceRules.contextFingerprint(context))||!MealWorkspaceRules.matchesContext(original,originalContext);
                List<Long> ids;
                if(intent.getTargetDishId()!=null||intent.getReplacementDishId()!=null){
                    if(!"adjust".equals(intent.getOperation())||contextChanged||intent.getSelectedDishIds()!=null||intent.getTargetDishId()==null||intent.getReplacementDishId()==null)throw new IllegalArgumentException("整餐条件变化时请重新生成完整菜单");
                    if(!currentIds.contains(intent.getTargetDishId())||locks.contains(intent.getTargetDishId()))throw new IllegalArgumentException("替换对象无效或仍在保留");
                    ids=new ArrayList<>(currentIds);ids.set(ids.indexOf(intent.getTargetDishId()),intent.getReplacementDishId());
                } else {
                    if(intent.getTargetConstraints()!=null)throw new IllegalArgumentException("单菜限制需要明确替换对象");
                    ids=intent.getSelectedDishIds()==null?new ArrayList<>(currentIds):new ArrayList<>(intent.getSelectedDishIds());
                    if((contextChanged||Arrays.asList("generate","regenerate").contains(intent.getOperation()))&&intent.getSelectedDishIds()==null)throw new IllegalArgumentException("请提供满足新条件的完整菜单");
                }
                if(ids.isEmpty()||ids.size()>10||new HashSet<>(ids).size()!=ids.size()||!ids.containsAll(locks))throw new IllegalArgumentException("菜单数量、重复项或保留项无效");
                Set<Long> authorized=new HashSet<>(validated.authorizedDishIds);authorized.addAll(currentIds);
                if(!authorized.containsAll(ids))throw new IllegalArgumentException("请先读取可访问的真实候选菜品");
                w.setContext(context);w.getDraft().setLockedDishIds(locks);
                PlanDraft next=planner.validateAgent(user,w,ids);
                Map<Long,Dish> selected=next.getDishes().stream().collect(Collectors.toMap(Dish::getId,d->d));
                if(!selected.keySet().equals(new HashSet<>(ids)))throw new IllegalArgumentException("候选菜单不完整");
                for(Dish prior:original.getDishes())if(selected.containsKey(prior.getId())&&!Objects.equals(prior.getContentVersion(),selected.get(prior.getId()).getContentVersion()))throw conflict("当前菜品内容已更新，请先查看最新内容");
                if(intent.getTargetConstraints()!=null){
                    MealContext target=json.convertValue(context,MealContext.class);target.setCriteria(intent.getTargetConstraints());
                    if(planner.eligible(user,target).stream().noneMatch(d->Objects.equals(d.getId(),intent.getReplacementDishId())))throw new IllegalArgumentException("替换菜不满足指定条件");
                }
                next.setDishes(ids.stream().map(selected::get).collect(Collectors.toList()));next.setLockedDishIds(locks);
                next.setContextFingerprint(MealWorkspaceRules.contextFingerprint(context));next.setRequirementsFingerprint(original.getRequirementsFingerprint());next.setSource("assistant");
                next.setAdjustedBeforeConfirmation(!original.getDishes().isEmpty()||original.isAdjustedBeforeConfirmation());
                PlanDraft checkpoint=MealWorkspaceRules.copy(original);checkpoint.setHistory(new ArrayList<>());checkpoint.setContextSnapshot(originalContext);
                List<PlanDraft> history=new ArrayList<>(original.getHistory());history.add(checkpoint);if(history.size()>10)history.remove(0);
                next.setHistory(history);next.setContextSnapshot(null);next.setPlanVersion(original.getPlanVersion()+1);next.setTotalCookMinutes(MealWorkspaceRules.totalMinutes(next.getDishes()));w.setDraft(next);
                planner.lockAndValidateAssistant(user,w,ids);
            }
            db.cancel(id,user,w.getTaskId());w.setTaskId(null);w.setSuggestedTarget(null);w.setStatus(w.getDraft().getDishes().isEmpty()?"empty":MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())?"draft":"needs_regeneration");w.setMessage("本餐已调整，可以撤销最近一次修改");
            long before=w.getRevision();w.setRevision(before+1);
            if(db.save(id,user,w.getRevision(),before,encode(w))!=1)throw conflict("工作区已更新");
            receipt(user,requestId,hash,w);return w;
        });
    }
    private static List<Long> orEmpty(List<Long> ids){return ids==null?Collections.emptyList():ids;}
    private static boolean preservesInterpretedLimits(MealContext before,MealContext after){
        RecommendationCriteria a=before.getCriteria(),b=after.getCriteria();
        return b.getExcludedIngredients()!=null&&b.getExcludeTagCodes()!=null&&b.getCuisineCodes()!=null&&b.getIncludeTagCodes()!=null
            &&b.getExcludedIngredients().containsAll(a.getExcludedIngredients())&&b.getExcludeTagCodes().containsAll(a.getExcludeTagCodes())
            &&(a.getCuisineCodes().isEmpty()||!b.getCuisineCodes().isEmpty()&&a.getCuisineCodes().containsAll(b.getCuisineCodes()))
            &&(a.getIncludeTagCodes().isEmpty()||!b.getIncludeTagCodes().isEmpty()&&a.getIncludeTagCodes().containsAll(b.getIncludeTagCodes()))
            &&(a.getMaxCookMinutes()==null||b.getMaxCookMinutes()!=null&&b.getMaxCookMinutes()<=a.getMaxCookMinutes())
            &&(before.getTotalCookMinutes()==null||after.getTotalCookMinutes()!=null&&after.getTotalCookMinutes()<=before.getTotalCookMinutes());
    }
    public MealWorkspace finish(WorkspaceTask task,MealContext interpreted,PlanDraft draft,String message,String status) {
        return finish(task,interpreted,draft,message,status,null);
    }
    public MealWorkspace finish(WorkspaceTask task,MealContext interpreted,PlanDraft draft,String message,String status,Map<String,String> target) {
        return tx.execute(t->{
            lock(task.getUserId());MealWorkspace w=read(db.find(task.getWorkspaceId(),task.getUserId()));
            if(w==null||!Objects.equals(w.getTaskId(),task.getId())||!Objects.equals(w.getRevision(),task.getBaseRevision())||!"generating".equals(w.getStatus())) {
                db.finish(task.getId(),task.getLeaseToken(),"discarded","{}");return w;
            }
            if(db.finish(task.getId(),task.getLeaseToken(),status,"{}")!=1)return w;
            if(draft!=null) {
                if(!w.getDraft().getDishes().isEmpty())db.event("adjusted:"+task.getId(),task.getUserId(),w.getId(),draft.getPlanVersion(),"replaced",draft.getSource());
                w.setDraft(draft);if(interpreted!=null)w.setContext(interpreted);db.event("generated:"+task.getId(),task.getUserId(),w.getId(),draft.getPlanVersion(),"generated",draft.getSource());}
            w.setStatus(status);w.setMessage(message);w.setSuggestedTarget(target);w.setTaskId(null);long before=w.getRevision();w.setRevision(before+1);
            if(db.save(w.getId(),task.getUserId(),w.getRevision(),before,encode(w))!=1)throw conflict("工作区已更新");return w;
        });
    }
    public WorkspaceTask task(Long user,String ws,String id) {if(db.find(ws,user)==null)throw new IllegalArgumentException("工作区不可访问");WorkspaceTask task=db.taskById(id,ws,user);if(task==null)throw new IllegalArgumentException("任务不存在");task.setInputJson(null);task.setResultJson(null);task.setLeaseToken(null);return task;}
    public MealWorkspace request(Long user,String ws,String key) {RequestIdValidator.requireValid(key);if(db.find(ws,user)==null)throw new IllegalArgumentException("工作区不可访问");Map<String,Object> r=db.request(user,key);if(r==null)return null;MealWorkspace w=decode(String.valueOf(r.get("responseJson")),MealWorkspace.class);if(!ws.equals(w.getId()))throw new IllegalArgumentException("请求不属于本餐");return w;}
    private void validateRequest(WorkspaceRequest r) {RequestIdValidator.requireValid(r.getRequestId());if(r.getExpectedWorkspaceRevision()==null||r.getExpectedWorkspaceRevision()<0)throw new IllegalArgumentException("请提供工作区版本");}
    private String hash(String op,String id,Object request) {return WorkflowRequestHash.sha256(op+"|"+id+"|"+encode(request));}
    private MealWorkspace replay(Long user,String key,String hash) {Map<String,Object> prior=db.request(user,key);if(prior==null)return null;if(!hash.equals(prior.get("requestHash")))throw conflict("请求标识已用于不同内容");return decode(String.valueOf(prior.get("responseJson")),MealWorkspace.class);}
    private void receipt(Long user,String key,String hash,MealWorkspace w) {
        MealWorkspace safe=json.convertValue(w,MealWorkspace.class);safe.getContext().setRequirements("");safe.getContext().setOwnedIngredients(new ArrayList<>());safe.getContext().setCriteria(new RecommendationCriteria());
        PlanDraft minimal=new PlanDraft();minimal.setPlanVersion(w.getDraft().getPlanVersion());minimal.setSource(w.getDraft().getSource());safe.setDraft(minimal);
        db.log(user,key,hash,encode(safe));
    }
    private MealConsumptionService.VersionConflict conflict(String message) {return new MealConsumptionService.VersionConflict(message);}
}
