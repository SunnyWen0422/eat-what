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
    public MealWorkspace current(Long user,String date,String meal) {
        MealContext c=new MealContext();c.setDate(date);c.setMealType(meal);MealWorkspaceRules.normalize(c);
        return read(db.slot(user,date,meal));
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
                db.cancel(id);w.setTaskId(null);w.getDraft().setRequirementsFingerprint(null);w.setContext(c);w.setStatus(w.getDraft().getDishes().isEmpty()?"empty":"needs_regeneration");w.setMessage("本餐条件已保存，重新安排后生效");
            } else {
                if(!Objects.equals(w.getDraft().getPlanVersion(),request.getPlanVersion()))throw conflict("方案版本已更新");
                if("confirm".equals(operation)) confirm(user,w,request);
                else if("cancel".equals(command)) {db.cancel(id);w.setTaskId(null);w.setStatus(w.getDraft().getDishes().isEmpty()?"empty":MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())?"draft":"needs_regeneration");w.setMessage("已停止，原方案已保留");}
                else if(Arrays.asList("keep","release","undo").contains(command)) {
                    db.cancel(id);w.setTaskId(null);w.setDraft(MealWorkspaceRules.command(w.getDraft(),command,request.getDishId(),null));w.setStatus(MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())?"draft":"needs_regeneration");w.setMessage("条件已变化时需要重新安排");
                } else if(Arrays.asList("generate","regenerate","replace","select").contains(command)) {
                    db.cancel(id);WorkspaceTask task=new WorkspaceTask();task.setId(UUID.randomUUID().toString());task.setWorkspaceId(id);task.setUserId(user);task.setBaseRevision(before+1);
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
        RecipeRecord slot=plans.findSlot(user,w.getContext().getDate(),w.getContext().getMealType());long current=slot==null?0:slot.getRevision();
        if(current!=request.getExpectedPlanRevision())throw conflict("原安排已更新，请重新查看替换内容");
        // Validate current ownership and hard restrictions again at the authoritative write boundary.
        List<Long> ids=w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        planner.lockAndValidate(user,w,ids);
        RecipeRecord plan=new RecipeRecord();plan.setUserId(user);plan.setRecordDateString(w.getContext().getDate());plan.setMealType(w.getContext().getMealType());plan.setTargetPeople(w.getContext().getPeople());
        plan.setRecipeName(w.getDraft().getDishes().stream().map(Dish::getName).collect(Collectors.joining("、")));plan.setDishIds(ids);plan.setIsManual(0);plan.setExpectedRevision(current);
        planService.saveWorkspaceRecipeRecord(plan,w.getDraft().getDishes());
        Map<String,Object> receipt=new LinkedHashMap<>();receipt.put("requestId",request.getRequestId());receipt.put("planVersion",w.getDraft().getPlanVersion());receipt.put("planRevision",current+1);receipt.put("date",w.getContext().getDate());receipt.put("mealType",w.getContext().getMealType());
        if(w.getConfirmation()==null&&!w.getDraft().isAdjustedBeforeConfirmation())db.event(WorkflowRequestHash.sha256(user+"|first_accept|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"first_accepted",w.getDraft().getSource());
        w.setConfirmation(receipt);w.setStatus("planned");w.setMessage("已保存安排，可以查看做法或准备采购");
        db.event(WorkflowRequestHash.sha256(user+"|accepted|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"accepted",w.getDraft().getSource());
        db.event(WorkflowRequestHash.sha256(user+"|plan|"+request.getRequestId()),user,w.getId(),w.getDraft().getPlanVersion(),"plan_saved",w.getDraft().getSource());
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
