package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.mapper.ControlledToolTaskMapper;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.util.RequestIdValidator;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Executes the fixed Java tool contract. The model cannot supply ownership, SQL,
 * a write result, or replacement arguments at confirmation time.
 * Each write and its completed step receipt share the domain transaction.
 */
@Service
public class ControlledToolHarnessService {
    private static final long PREVIEW_TTL_MILLIS=10*60*1000L;
    private final ControlledToolTaskMapper db;
    private final MealConsumptionMapper locks;
    private final MealWorkspaceService workspaces;
    private final MealConsumptionService actual;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final Clock clock;

    @Autowired
    public ControlledToolHarnessService(ControlledToolTaskMapper db,MealConsumptionMapper locks,
            MealWorkspaceService workspaces,MealConsumptionService actual,ObjectMapper json,TransactionTemplate tx) {
        this(db,locks,workspaces,actual,json,tx,Clock.systemUTC());
    }
    ControlledToolHarnessService(ControlledToolTaskMapper db,MealConsumptionMapper locks,
            MealWorkspaceService workspaces,MealConsumptionService actual,ObjectMapper json,TransactionTemplate tx,Clock clock) {
        this.db=db;this.locks=locks;this.workspaces=workspaces;this.actual=actual;
        this.json=json.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true)
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY,true);
        this.tx=tx;this.clock=clock;
    }

    public ControlledToolTask preview(Long user,Map<String,Object> request) {
        requireUser(user);
        List<ControlledToolTask.Step> steps=ControlledToolRegistry.validate(request);
        String key=(String)request.get("requestId");
        String hash=WorkflowRequestHash.sha256("controlled-tools:v1|"+encode(steps));
        return tx.execute(status->{
            lock(user);
            Map<String,Object> prior=db.byRequest(user,key);
            if(prior!=null) {
                if(!hash.equals(prior.get("requestHash")))throw conflict("请求标识已用于不同工具或内容");
                return decode(prior);
            }
            ControlledToolTask task=new ControlledToolTask();task.id=UUID.randomUUID().toString();task.requestId=key;
            task.previewToken=UUID.randomUUID().toString();task.expiresAt=clock.millis()+PREVIEW_TTL_MILLIS;task.steps=steps;
            List<String> summary=new ArrayList<>();
            for(ControlledToolTask.Step step:steps) {
                if(ControlledToolRegistry.CONFIRM_MEAL.equals(step.tool)) {
                    step.binding=mealBinding(user,step.arguments);step.contentHash=hash(step.binding);
                    summary.add(mealSummary(step.binding));
                } else if(ControlledToolRegistry.READ_MEAL.equals(step.tool)) {
                    summary.add("查看 "+step.arguments.get("date")+" "+mealLabel((String)step.arguments.get("mealType"))+" 的当前内容");
                } else summary.add("查看 "+step.arguments.get("startDate")+" 至 "+step.arguments.get("endDate")+" 的实际用餐回顾");
            }
            summary.add("保存计划不计入实际用餐；回顾只统计已明确记录吃过的餐次。");
            task.summary=String.join("\n",summary);task.message="请核对服务器预览后确认";
            db.insert(task.id,user,key,hash,encode(task));return task;
        });
    }

    public ControlledToolTask get(Long user,String id) {
        requireUser(user);RequestIdValidator.requireValid(id);
        Map<String,Object> row=db.find(user,id);
        if(row==null)throw new IllegalArgumentException("任务不存在或不属于当前账号");
        return decode(row);
    }
    public ControlledToolTask byRequest(Long user,String requestId) {
        requireUser(user);RequestIdValidator.requireValid(requestId);
        Map<String,Object> row=db.byRequest(user,requestId);return row==null?null:decode(row);
    }

    /** Also resumes an already approved partial task; completed steps are never rerun. */
    public ControlledToolTask confirm(Long user,String id,String token) {
        requireUser(user);RequestIdValidator.requireValid(id);
        if(token==null||token.length()>100)throw new IllegalArgumentException("预览凭证无效");
        ControlledToolTask accepted=tx.execute(status->{
            lock(user);ControlledToolTask task=get(user,id);
            if(!Objects.equals(task.previewToken,token))throw new IllegalArgumentException("预览凭证无效");
            if(terminal(task))return task;
            if(hasPendingWrite(task)&&clock.millis()>task.expiresAt) {
                fail(task,"PREVIEW_EXPIRED","预览已过期，请重新查看并确认",false);save(user,task);return task;
            }
            task.confirmed=true;task.status="running";task.errorCode=null;task.message="正在执行已确认的步骤";save(user,task);return task;
        });
        if(terminal(accepted))return accepted;
        for(int index=0;index<accepted.steps.size();index++) {
            final int stepIndex=index;
            try {
                ControlledToolTask task=tx.execute(status->{
                    lock(user);ControlledToolTask latest=get(user,id);
                    if(terminal(latest))return latest;
                    ControlledToolTask.Step step=latest.steps.get(stepIndex);
                    if("completed".equals(step.status))return latest;
                    if(!latest.confirmed)throw new IllegalArgumentException("任务尚未确认");
                    // The account lock is shared with workspace/calendar mutation services.
                    step.result=execute(user,latest,step,stepIndex);
                    step.status="completed";latest.errorCode=null;
                    if(ControlledToolRegistry.READ_REVIEW.equals(step.tool))latest.report=step.result;
                    boolean complete=latest.steps.stream().allMatch(s->"completed".equals(s.status));
                    latest.status=complete?"completed":"running";latest.retryable=!complete;
                    latest.message=complete?"已完成；保存计划不计入实际用餐，回顾仅统计实际记录":"已完成部分步骤，继续处理";
                    save(user,latest);return latest;
                });
                if(terminal(task))return task;
            } catch(RuntimeException error) {
                // A failed domain transaction has rolled back before this failure receipt is saved.
                // If persistence itself is unavailable, the caller gets an unknown outcome and queries this task.
                return tx.execute(status->{
                    lock(user);ControlledToolTask task=get(user,id);
                    if("completed".equals(task.steps.get(stepIndex).status))return task;
                    task.steps.get(stepIndex).status="failed";
                    boolean conflict=error instanceof MealConsumptionService.VersionConflict;
                    boolean invalid=error instanceof IllegalArgumentException;
                    boolean expired=error instanceof PreviewExpired;
                    fail(task,expired?"PREVIEW_EXPIRED":conflict?"WORKFLOW_VERSION_CONFLICT":invalid?"TOOL_ARGUMENT_INVALID":"TOOL_EXECUTION_FAILED",
                            expired?"预览已过期，请重新查看并确认":conflict?"本餐或原安排已变化，请重新预览确认":invalid?"当前内容无法执行，请重新查看本餐":"部分步骤暂未完成，可查询原任务后继续",
                            !conflict&&!invalid&&!expired);
                    save(user,task);return task;
                });
            }
        }
        return get(user,id);
    }

    private Map<String,Object> execute(Long user,ControlledToolTask task,ControlledToolTask.Step step,int index) {
        if(ControlledToolRegistry.CONFIRM_MEAL.equals(step.tool)) {
            if(clock.millis()>task.expiresAt)throw new PreviewExpired();
            Map<String,Object> current=mealBinding(user,step.arguments);
            if(!Objects.equals(step.contentHash,hash(current)))throw conflict("预览内容已更新");
            WorkspaceRequest request=new WorkspaceRequest();
            request.setRequestId("harness-"+task.id+"-"+index);
            request.setExpectedWorkspaceRevision(number(step.binding.get("workspaceRevision")));
            request.setPlanVersion(number(step.binding.get("planVersion")));
            request.setExpectedPlanRevision(number(step.binding.get("planRevision")));
            MealWorkspace saved=workspaces.mutate(user,(String)step.binding.get("workspaceId"),"confirm",request);
            Map<String,Object> result=new LinkedHashMap<>();result.put("executed",true);result.put("workspaceId",saved.getId());
            result.put("workspaceRevision",saved.getRevision());result.put("confirmation",saved.getConfirmation());
            result.put("countsAsActual",false);return result;
        }
        if(ControlledToolRegistry.READ_MEAL.equals(step.tool)) {
            String date=(String)step.arguments.get("date"),meal=(String)step.arguments.get("mealType");
            return workspaces.linked(user,workspaces.current(user,date,meal),date,meal);
        }
        if(ControlledToolRegistry.READ_REVIEW.equals(step.tool))
            return actual.review(user,(String)step.arguments.get("startDate"),(String)step.arguments.get("endDate"));
        throw new IllegalArgumentException("不支持的工具");
    }

    private Map<String,Object> mealBinding(Long user,Map<String,Object> args) {
        MealWorkspace workspace=workspaces.current(user,(String)args.get("date"),(String)args.get("mealType"));
        if(workspace==null||workspace.getContext()==null||workspace.getDraft()==null)
            throw new IllegalArgumentException("请先安排当前餐");
        if(!Arrays.asList("draft","planned").contains(workspace.getStatus())||workspace.getTaskId()!=null
                ||workspace.getDraft().getDishes().isEmpty()
                ||!MealWorkspaceRules.matchesContext(workspace.getDraft(),workspace.getContext())
                ||!MealWorkspaceRules.understandsRequirements(workspace.getDraft(),workspace.getContext()))
            throw new IllegalArgumentException("本餐仍在处理或条件已变化，请重新安排后预览");
        Map<String,Object> linked=workspaces.linked(user,workspace);
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("workspaceId",workspace.getId());result.put("workspaceRevision",workspace.getRevision());
        result.put("planVersion",workspace.getDraft().getPlanVersion());result.put("planRevision",number(linked.get("planRevision")));
        result.put("date",workspace.getContext().getDate());result.put("mealType",workspace.getContext().getMealType());
        result.put("people",workspace.getContext().getPeople());result.put("contextHash",MealWorkspaceRules.contextFingerprint(workspace.getContext()));
        result.put("dishes",json.convertValue(workspace.getDraft().getDishes(),List.class));
        result.put("replacedPlan",linked.get("plan")==null?null:json.convertValue(linked.get("plan"),Map.class));
        return result;
    }
    @SuppressWarnings("unchecked")
    private String mealSummary(Map<String,Object> binding) {
        List<Map<String,Object>> dishes=(List<Map<String,Object>>)binding.get("dishes");
        String names=dishes.stream().map(d->String.valueOf(d.get("name"))).collect(Collectors.joining("、"));
        Map<String,Object> previous=(Map<String,Object>)binding.get("replacedPlan");
        String replaced=previous==null?"当前没有已保存安排":"将替换原安排："+String.valueOf(previous.get("recipeName"));
        return "保存 "+binding.get("date")+" "+mealLabel((String)binding.get("mealType"))+"，"+binding.get("people")+" 人："+names+"。\n"+replaced+"（安排版本 "+binding.get("planRevision")+"）。";
    }
    private static String mealLabel(String meal){return "breakfast".equals(meal)?"早餐":"lunch".equals(meal)?"午餐":"晚餐";}
    private boolean hasPendingWrite(ControlledToolTask task){return task.steps.stream().anyMatch(s->ControlledToolRegistry.CONFIRM_MEAL.equals(s.tool)&&!"completed".equals(s.status));}
    private boolean terminal(ControlledToolTask task){return "completed".equals(task.status)||!task.retryable;}
    private void fail(ControlledToolTask task,String code,String message,boolean retryable) {
        boolean partial=task.steps.stream().anyMatch(s->"completed".equals(s.status));
        task.status=partial?"partial_failed":"failed";task.errorCode=code;task.retryable=retryable;
        task.message=(partial?"已完成步骤保留。":"")+message;
    }
    private void lock(Long user){if(locks.lockUser(user)==null)throw new IllegalArgumentException("用户不存在");}
    private static void requireUser(Long user){if(user==null||user<1)throw new IllegalArgumentException("请先登录");}
    private static Long number(Object value){if(!(value instanceof Number))throw new IllegalArgumentException("缺少有效版本");return ((Number)value).longValue();}
    private void save(Long user,ControlledToolTask task){if(db.save(user,task.id,encode(task))!=1)throw new IllegalStateException("任务回执未保存");}
    private String hash(Object value){return WorkflowRequestHash.sha256(encode(value));}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception error){throw new IllegalStateException("任务内容无法保存",error);}}
    private ControlledToolTask decode(Map<String,Object> row){try{return json.readValue(String.valueOf(row.get("stateJson")),ControlledToolTask.class);}catch(Exception error){throw new IllegalStateException("任务回执无法读取",error);}}
    private MealConsumptionService.VersionConflict conflict(String message){return new MealConsumptionService.VersionConflict(message);}
    private static class PreviewExpired extends RuntimeException { }
}
