package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.dto.ControlledToolTask;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import javax.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

/** Bounded orchestration. Only server reads confer provenance, and only adapters confer success. */
@Service
public class AssistantV4TurnService {
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;

    // Must match server-authored questions in assistant_v4_schema.py / assistant_v4_step.py.
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(AssistantV4TurnService.class);
    private static final String SAFE_QUESTION="请说明要查询或调整的菜品、餐次。";
    private static final String UNAVAILABLE="本次智能理解暂不可用，请明确需求或稍后重试。";
    private static final Set<String> QUESTIONS=Collections.unmodifiableSet(new HashSet<>(Arrays.asList("这餐安排几个人用餐？","请说明目标日期。","请说明目标餐次：早餐、午餐或晚餐。","请说明要查询或调整哪道菜。","请说明使用当前餐还是已有的日历安排。",SAFE_QUESTION,UNAVAILABLE,"这餐想优先调整什么？","这餐每道菜最多做几分钟？","这餐不吃哪些食材？")));
    private final AssistantV4Store store;
    private final AssistantV4ContextService contexts;
    private final AssistantCapabilityService registry;
    private final AssistantV4ModelGateway model;
    private final AiProtectionService protection;
    private final DishQueryService dishes;
    private final ObjectMapper json;
    private final Clock clock;
    private final Executor executor;
    private final ConcurrentMap<String,FutureTask<Void>> scheduled=new ConcurrentHashMap<>();
    private AssistantGuidanceService guidance;
    private ControlledToolHarnessService directHarness;
    @Autowired void setDirectHarness(ControlledToolHarnessService harness){directHarness=harness;}
    private final ThreadLocal<Set<String>> resuming=ThreadLocal.withInitial(HashSet::new);
    private boolean directRequest(TurnRequest request){return directHarness!=null&&request.getUiFeatures()!=null&&request.getUiFeatures().contains("direct_execution_v1");}

    @Autowired void setGuidance(AssistantGuidanceService service){guidance=service;}
    @Autowired public AssistantV4TurnService(AssistantV4Store store,AssistantV4ContextService contexts,AssistantCapabilityService registry,AssistantV4ModelGateway model,AiProtectionService protection,DishQueryService dishes,ObjectMapper json){
        this(store,contexts,registry,model,protection,dishes,json,Clock.systemUTC(),new ThreadPoolExecutor(2,2,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(16),r->{Thread t=new Thread(r,"assistant-v4");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy()));
    }
    AssistantV4TurnService(AssistantV4Store store,AssistantV4ContextService contexts,AssistantCapabilityService registry,AssistantV4ModelGateway model,AiProtectionService protection,DishQueryService dishes,ObjectMapper json,Clock clock,Executor executor){this.store=store;this.contexts=contexts;this.registry=registry;this.model=model;this.protection=protection;this.dishes=dishes;this.json=json;this.clock=clock;this.executor=executor;registry.registerTurnExecutor(this::enqueue);}
    @PreDestroy public void close(){if(executor instanceof ExecutorService)((ExecutorService)executor).shutdown();}
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=15000,initialDelay=15000)
    public void recoverInterrupted(){if(!registry.capabilities().isEnabled())return;for(TurnRecord row:store.recoverable()){try{if("queued".equals(row.getStatus()))enqueue(row.getUserId(),row.getId());else store.recoverExpired(row.getUserId(),row.getId());}catch(RuntimeException stale){/* Another worker, cancellation, or retention won. */}}}
    public TurnView startTurn(Long user,String sessionId,TurnRequest request){registry.requireEnabled();TurnView view=store.claimTurn(user,sessionId,request);if("queued".equals(view.getStatus()))enqueue(user,view.getTurnId());return store.findTurn(user,view.getTurnId());}
    public TurnView cancelTurn(Long user,String turnId){
        // Commit the authoritative cancellation first; completed receipts remain intact.
        TurnView view=store.cancelTurn(user,turnId);
        if("cancelled".equals(view.getStatus())){
            FutureTask<Void> task=scheduled.get(user+":"+turnId);
            if(task!=null){task.cancel(true);if(executor instanceof ThreadPoolExecutor)((ThreadPoolExecutor)executor).remove(task);}
        }
        return view;
    }
    public void enqueue(Long user,String turnId){
        String key=user+":"+turnId;
        FutureTask<Void> task=new FutureTask<Void>(()->{runTurn(user,turnId);return null;}){
            @Override protected void done(){scheduled.remove(key,this);}
        };
        if(scheduled.putIfAbsent(key,task)!=null)return;
        try{executor.execute(task);}catch(RuntimeException ex){scheduled.remove(key,task);try{store.completeTurn(user,turnId,"queued",result("failed","请求较多，请稍后重试",true));}catch(RuntimeException stale){/* Another claimant owns it. */}}
    }
    private SessionState historyBeforeCurrentTurn(Long user,TurnRecord lease){
        SessionState session=store.sessionState(user,lease.getSessionId());
        List<Message> history=new ArrayList<>();
        for(Message message:session.getMessages())if(message!=null&&!lease.getId().equals(message.getTurnId()))history.add(message);
        // The current user message is persisted already, but is sent through StepInput.message.
        // Never deduplicate by text: a previous turn may legitimately repeat this wording.
        session.setMessages(history);return session;
    }
    public void runTurn(Long user,String turnId){
        TurnRecord lease;try{lease=store.acquireTurn(user,turnId);}catch(RuntimeException alreadyClaimed){return;}
        long observedStart=clock.millis();String observedOutcome="success";
        ExperienceMetrics.observe(metrics,"assistant_queue","success",observedStart-lease.getCreatedAt(),1);
        boolean acquired=false;int providerCalls=0,readCalls=0,cacheHits=0;
        try {
            TurnRequest request=store.turnRequest(user,turnId);
            AiProtectionService.Decision decision=protection.acquire(user,"assistant-v4",request.getMessage().getBytes(StandardCharsets.UTF_8).length);
            if(!decision.isAllowed()){observedOutcome="error";finish(user,lease,result("failed","请求较多，请稍后重试",true));return;}acquired=true;
            TurnScope scope=scope(user,lease,request);ModelContext context=contexts.build(user,request,historyBeforeCurrentTurn(user,lease));
            Capabilities caps=registry.capabilities();List<String> actual=new ArrayList<>(caps.getReads());actual.addAll(caps.getDraftCommands());actual.addAll(caps.getPreviewActions());if(request.getUiFeatures()!=null)for(String feature:request.getUiFeatures())if(caps.getSupportedUiFeatures().contains(feature))actual.add(feature);context.setCapabilities(actual);boundContext(context);
            authorizeCurrent(context.getActiveMeal(),scope);
            // Context contains only the server-validated, owned clarification choice.
            // Keeping the menu is already a complete decision, not a model instruction.
            Object choice=context.getRequestContext().get("clarification");
            Map<String,Object> clarification=choice instanceof Map?map(choice):Collections.emptyMap();
            if("meal_requirement".equals(clarification.get("kind"))&&clarification.get("selection") instanceof Map&&"keep".equals(map(clarification.get("selection")).get("requirementMode"))){
                active(user,lease);ReadResult current=new ReadResult();current.setCallId("kept-current-meal");current.setName("read_current_meal");current.getItems().add(context.getActiveMeal());
                TurnResult kept=result("completed","好的，先保持当前菜单。",false);kept.setCards(factCards(user,current));kept.setWorkspaceRef(reference(scope));finish(user,lease,kept);return;
            }
            StepInput input=new StepInput();input.setContext(context);input.setMessage(request.getMessage());input.setConversationFrames(frames(context));
            Set<String> usedCalls=new HashSet<>();List<Card> facts=new ArrayList<>();List<AssistantFactReplyFormatter.AuthorizedReadFact> authorizedFacts=new ArrayList<>();int readCount=0,factChars=0;List<ReadResult> answerReads=new ArrayList<>();AssistantTurnReadCache readCache=new AssistantTurnReadCache(json);boolean correctedAction=false;
            for(int round=0;round<4;round++){
                active(user,lease);
                // Keep 0.5s for local completion inside the unchanged 30s lease. Each HTTP attempt
                // has at most 23s: Python reserves 3s of that envelope and waits at most 20s.
                if(lease.getModelDeadlineAt()-clock.millis()<4000)throw new IllegalStateException("请求剩余时间不足");
                int used=store.reserveProviderCall(user,turnId,lease.getLeaseToken());providerCalls++;
                long now=clock.millis(),outerMillis=Math.min(23000,lease.getModelDeadlineAt()-now-500);
                if(outerMillis<3500)throw new IllegalStateException("请求剩余时间不足");
                input.setTimeoutSeconds(outerMillis/1000.0);input.setDeadlineEpochMillis(now+outerMillis);input.setFinalRound(used==4||readCount==8);
                input.setReplyContract(null);input.setAnswerBasis(null);
                if(model.supportsNaturalReplies()){
                    AnswerBasis basis=new AssistantAnswerBasisService(json).build(context,answerReads);
                    if(encode(basis).length()+encode(input.getReadResults()).length()+32<=12000){input.setReplyContract(model.supportsFlexibleReplies()?"meal_reply.v2":"meal_reply.v1");input.setAnswerBasis(basis);}
                }
                // A capability probe consumes the same turn deadline, never a fresh timeout.
                now=clock.millis();outerMillis=Math.min(23000,lease.getModelDeadlineAt()-now-500);
                if(outerMillis<3500)throw new IllegalStateException("请求剩余时间不足");
                input.setTimeoutSeconds(outerMillis/1000.0);input.setDeadlineEpochMillis(now+outerMillis);
                StepOutput output=model.step(input);active(user,lease);
                validateOutput(output);
                if("action_invalid".equals(output.getType())){
                    if(!correctedAction&&requestActionCorrection(input)){correctedAction=true;continue;}
                    throw new IllegalArgumentException("操作参数未能纠正");
                }
                if("read_calls".equals(output.getType())){
                    List<ToolRead> calls=output.getReadCalls();if(input.isFinalRound()||calls==null||calls.isEmpty()||calls.size()>4||readCount+calls.size()>8)throw new IllegalArgumentException("查询超出本次范围");
                    validateContinuation(output.getProviderContinuation(),calls,input.getProviderContinuation(),input.getReadResults());
                    Set<String> batch=new HashSet<>();for(ToolRead call:calls){if(call==null||call.getCallId()==null||call.getCallId().length()>100||call.getCallId().isEmpty()||usedCalls.contains(call.getCallId())||!batch.add(call.getCallId())||!caps.getReads().contains(call.getName()))throw new IllegalArgumentException("查询内容无效");registry.readExecutor(call.getName());}
                    List<ReadResult> results=new ArrayList<>();
                    for(ToolRead call:calls){active(user,lease);readCalls++;
                        String sourceVersion=registry.readVersion(call.getName(),user,scope);ReadResult read=readCache.find(call.getName(),call.getArguments(),sourceVersion);boolean cached=read!=null;
                        if(cached){read.setCallId(call.getCallId());cacheHits++;}else{read=registry.readExecutor(call.getName()).read(user,call,scope);readCache.put(call.getName(),call.getArguments(),sourceVersion,read);}active(user,lease);
                        if(read==null||!Objects.equals(read.getCallId(),call.getCallId())||!Objects.equals(read.getName(),call.getName()))throw new IllegalArgumentException("查询结果不匹配");
                        int length=cached?0:encode(read).length();if(factChars+length>12000){TurnResult stopped=result("needs_input","查询内容较多，请缩小日期范围或菜品范围",false);stopped.setCards(facts);stopped.setWorkspaceRef(reference(scope));finish(user,lease,stopped);return;}
                        factChars+=length;readCount++;usedCalls.add(call.getCallId());authorizeRead(read,scope);authorizedFacts.add(AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read,call));mergeFacts(facts,factCards(user,read));results.add(read);answerReads.add(read);
                    }
                    input.setReadResults(results);input.setProviderContinuation(output.getProviderContinuation());continue;
                }
                if("need_input".equals(output.getType())){String question="meal_reply.v2".equals(input.getReplyContract())?safeQuestion(output.getQuestion()):QUESTIONS.contains(output.getQuestion())?output.getQuestion():SAFE_QUESTION;TurnResult r=result("needs_input",question,UNAVAILABLE.equals(question));r.setCards(facts);r.setWorkspaceRef(reference(scope));if(guidance!=null&&actual.contains("clarification_v1")){Card card=guidance.createClarification(turnId,contextWorkspace(user,request),question);if(card!=null){retainOriginalIntent(card,context,request);r.getCards().add(card);}}finish(user,lease,r);return;}
                if("navigation".equals(output.getType())){
                    TurnResult r=result("needs_input","请在对应页面核对后操作",false);r.setCards(facts);r.setWorkspaceRef(reference(scope));
                    if(guidance!=null&&actual.contains("handoff_v1")){
                        try{Card card=guidance.resolveNavigation(user,output.getNavigationIntent(),scope,originalIntent(context,request));retainOriginalIntent(card,context,request);r.getCards().add(card);r.setReply(card.getType().equals("clarification")?card.getTitle():"打开页面后可继续编辑");}
                        catch(IllegalArgumentException|org.springframework.web.server.ResponseStatusException unavailable){r.setReply("相关内容已变化，请重新查询后再操作");}
                    }else r.setReply("可从日历、采购清单或我的内容进入对应功能");
                    finish(user,lease,r);return;
                }
                if(!"final".equals(output.getType()))throw new IllegalArgumentException("无法理解本次请求");
                if(output.getActionProposal()==null||output.getActionProposal().getSteps().isEmpty()){
                    // A selected context source is a fallback, never an older replacement for
                    // an actual executor read (including its explicit empty/partial result).
                    if("recent_actual".equals(output.getFactSource())&&authorizedFacts.stream().noneMatch(fact->!fact.contextSnapshot&&"read_actual_diet_review".equals(fact.name))){ReadResult recent=recentActualRead(context);authorizedFacts.add(AssistantFactReplyFormatter.AuthorizedReadFact.fromContext(recent));facts.addAll(recentActualCards(user,context,recent));}
                    // An explicit empty read is a result. Never replace it with an unrelated plan.
                    if(authorizedFacts.isEmpty()&&!rows(context.getActiveMeal().get("currentDishes")).isEmpty()){ReadResult current=new ReadResult();current.setCallId("current-meal");current.setName("read_current_meal");current.getItems().add(context.getActiveMeal());authorizedFacts.add(AssistantFactReplyFormatter.AuthorizedReadFact.fromContext(current));facts.addAll(factCards(user,current));}
                    TurnResult r=result("completed",new AssistantFactReplyFormatter().format(authorizedFacts,context),false);r.setCards(facts);
                    if(input.getReplyContract()!=null){AssistantAnswerPolicy.Decision answer=new AssistantAnswerPolicy().evaluate(output.getAnswer(),input.getAnswerBasis());
                        if(answer.isAccepted()){r.setReply(answer.getReply());r.setCards(selectAnswerDishCards(facts,answer.getCardRefs()));if("meal_reply.v2".equals(input.getReplyContract()))applyCardLabels(r.getCards(),output.getAnswer());}}
                    r.setWorkspaceRef(reference(scope));finish(user,lease,r);return;
                }
                if("meal_reply.v1".equals(input.getReplyContract())&&actual.contains("meal_requirements_v1")){
                    AssistantRequirementResolver.RequirementDecision resolved=new AssistantRequirementResolver().resolve(context,output.getActionProposal());
                    if(!"applicable".equals(resolved.getStatus())){
                        TurnResult r=result("needs_input","这餐想优先调整什么？",false);r.setCards(facts);r.setWorkspaceRef(reference(scope));
                        if(guidance!=null){Card card=guidance.createClarification(turnId,contextWorkspace(user,request),r.getReply());if(card!=null){retainOriginalIntent(card,context,request);r.getCards().add(card);}}
                        finish(user,lease,r);return;
                    }output.setActionProposal(resolved.getValidatedProposal());
                }
                try{validateActions(output.getActionProposal(),scope);if("meal_reply.v2".equals(input.getReplyContract())&&changesUninterpretedRequirements(output.getActionProposal(),context))throw new IllegalArgumentException("请使用结构化条件");}
                catch(IllegalArgumentException invalid){
                    // Correct model-authored parameters before checkpointing any business action.
                    // Same lease and four-call budget; never repair by changing the user's intent.
                    if(!correctedAction&&requestActionCorrection(input)){correctedAction=true;continue;}throw invalid;
                }
                // Raw wording is not a proven executable constraint. Keep the
                // workspace guard unchanged and give a deterministic next step
                // before checkpointing any action that cannot be applied.
                if(changesUninterpretedRequirements(output.getActionProposal(),context)){
                    TurnResult r=result("needs_input","这类文字要求暂不能自动应用。请打开上方“查看来源与菜单”中的“修改本餐要求”核对，或在本餐筛选中选择可用条件；菜单和长期偏好均未修改。",false);
                    r.setCards(facts);r.setWorkspaceRef(reference(scope));finish(user,lease,r);return;
                }
                WorkflowContinuation c=AssistantV4Contract.workflow(turnId,output.getActionProposal().getSteps());c=store.checkpointContinuation(user,turnId,lease.getLeaseToken(),c);
                if(executeStep(user,lease,scope,true,c,input.getReplyContract()!=null?output.getAnswer():null))resumeWorkflow(user,turnId);return;
            }
            throw new IllegalArgumentException("本次查询未完成");
        }catch(RuntimeException ex){observedOutcome=failRunning(user,lease);}finally{try{if(acquired)protection.release();}finally{ExperienceMetrics.observe(metrics,"task_execution",observedOutcome,clock.millis()-observedStart,1);LOG.info("assistant_turn provider_calls={} read_calls={} read_cache_hits={} workflow_outcome={} duration_ms={}",providerCalls,readCalls,cacheHits,observedOutcome,clock.millis()-observedStart);}}
    }
    private boolean requestActionCorrection(StepInput input){
        if(!"meal_reply.v2".equals(input.getReplyContract())||input.isFinalRound()||input.getMessage().length()>1800)return false;
        input.setMessage(input.getMessage()+"\n本次动作参数尚未执行。请按工具schema重新检查必要参数、动作顺序和已授权的真实菜品编号；需要数据时先查询，不得自行编造。临时条件用criteria等结构化字段，不只复制原话；无法执行的条件应简短解释或询问必要信息。保持用户原意，不让用户填写内部参数。");return true;
    }
    private String failRunning(Long user,TurnRecord lease){try{TurnRecord current=store.turnRecord(user,lease.getId());if(!"running".equals(current.getStatus()))return "cancelled".equals(current.getStatus())?"cancel":"error";if(current.getLeaseUntil()<=clock.millis()){store.recoverExpired(user,lease.getId());return "timeout";}TurnResult r=result("failed","本次处理未完成，请重新发送；已有内容仍保留",true);r.setContinuation(store.continuation(user,lease.getId()));r.setWorkspaceRef(store.findTurn(user,lease.getId()).getWorkspaceRef());finish(user,lease,r);}catch(RuntimeException stale){/* Cancellation/deletion wins over a late result. */}return "error";}
    private boolean changesUninterpretedRequirements(ActionProposal proposal,ModelContext context){
        Object current=context.getConstraints().get("requirements");String before=current instanceof String?((String)current).trim():"";
        for(ActionIntent action:proposal.getSteps())if("draft_update".equals(action.getKind())){
            Object patch=action.getArguments().get("contextPatch");
            if(patch instanceof Map&&((Map<?,?>)patch).containsKey("requirements")){
                Object value=((Map<?,?>)patch).get("requirements");
                if(value instanceof String&&!before.equals(((String)value).trim()))return true;
            }
        }
        return false;
    }
    private void finish(Long user,TurnRecord lease,TurnResult result){store.completeTurn(user,lease.getId(),"running",lease.getLeaseToken(),result);}
    private void active(Long user,TurnRecord lease){store.withActiveLease(user,lease.getId(),lease.getLeaseToken(),()->Boolean.TRUE);}
    /** Resume durable validated intent after a committed receipt; never requests the model again. */
    public TurnView resumeWorkflow(Long user,String turnId){
        String key=user+":"+turnId;if(resuming.get().contains(key))return store.findTurn(user,turnId);
        return driveWorkflow(user,turnId);
    }
    private TurnView driveWorkflow(Long user,String turnId){
        for(int attempt=0;attempt<6;attempt++){
            TurnRecord row=store.turnRecord(user,turnId);if(!"awaiting_confirmation".equals(row.getStatus()))return store.findTurn(user,turnId);
            WorkflowContinuation c=store.continuation(user,turnId);if(c==null||c.getCursor()>=c.getSteps().size())return store.findTurn(user,turnId);
            TurnRequest request=store.turnRequest(user,turnId);
            if("awaiting_confirmation".equals(c.getSteps().get(c.getCursor()).getStatus())){
                if(!directRequest(request))return store.findTurn(user,turnId);
                registry.requireEnabled();registry.requireUiFeatures(request.getUiFeatures());TurnView pending=store.findTurn(user,turnId);PendingAction action=pending.getPendingAction();
                if(action==null||!Objects.equals(action.getTaskId(),c.getSteps().get(c.getCursor()).getTaskId()))return pending;
                String key=user+":"+turnId;resuming.get().add(key);
                ControlledToolTask confirmed;
                try{confirmed=directHarness.confirm(user,action.getTaskId(),action.getPreviewToken());}
                catch(RuntimeException failure){return directUnresolved(user,turnId,action);}
                finally{resuming.get().remove(key);if(resuming.get().isEmpty())resuming.remove();}
                TurnView after=store.findTurn(user,turnId);
                if(confirmed!=null&&Objects.equals(action.getTaskId(),confirmed.id)&&!confirmed.retryable&&Arrays.asList("failed","partial_failed","cancelled").contains(confirmed.status)){
                    String message="PREVIEW_EXPIRED".equals(confirmed.errorCode)?"这次操作已过期，请重新提出要求":"WORKFLOW_VERSION_CONFLICT".equals(confirmed.errorCode)?"本餐或目标安排已变化，请查看最新内容后重新提出要求":"这次操作未能完成，请查看当前内容后重新提出要求";
                    return store.failPendingAction(user,turnId,action.getStepId(),action.getTaskId(),message);
                }
                if(after.getPendingAction()!=null&&Objects.equals(action.getTaskId(),after.getPendingAction().getTaskId()))return directUnresolved(user,turnId,action);
                continue;
            }
            if(!"pending".equals(c.getSteps().get(c.getCursor()).getStatus()))return store.findTurn(user,turnId);
            TurnScope scope=scope(user,row,request);WorkspaceRef ref=store.findTurn(user,turnId).getWorkspaceRef();if(ref!=null){scope.setExpectedWorkspaceRevision(ref.getWorkspaceRevision());scope.setExpectedPlanVersion(ref.getPlanVersion());}
            try{if(!executeStep(user,row,scope,false,c))return store.findTurn(user,turnId);}catch(RuntimeException failure){
                // A competing confirmation may already have advanced the durable revision. Never regress it.
                TurnRecord latest=store.turnRecord(user,turnId);WorkflowContinuation current=store.continuation(user,turnId);
                if(!"awaiting_confirmation".equals(latest.getStatus())||current==null||current.getRevision()!=c.getRevision())return store.findTurn(user,turnId);
                TurnView old=store.findTurn(user,turnId);TurnResult retry=result("awaiting_confirmation","已完成的内容仍保留，下一步准备失败，请重试",true);retry.setContinuation(current);retry.setCards(old.getCards());retry.setWorkspaceRef(old.getWorkspaceRef());
                try{store.completeTurn(user,turnId,"awaiting_confirmation",retry);}catch(RuntimeException conflict){/* concurrent resume won */}return store.findTurn(user,turnId);
            }
        }return store.findTurn(user,turnId);
    }
    private TurnView directUnresolved(Long user,String id,PendingAction pending){
        try{return store.withActiveParent(user,id,pending.getStepId(),()->{
            TurnView current=store.findTurn(user,id);if(current.getPendingAction()==null||!Objects.equals(pending.getTaskId(),current.getPendingAction().getTaskId()))return current;
            TurnResult retry=result("awaiting_confirmation","操作结果还待核对，已完成的内容仍保留",true);retry.setCards(current.getCards());retry.setPendingAction(current.getPendingAction());retry.setContinuation(store.continuation(user,id));retry.setWorkspaceRef(current.getWorkspaceRef());return store.completeTurn(user,id,"awaiting_confirmation",retry);
        });}catch(RuntimeException changed){return store.findTurn(user,id);}
    }
    private boolean executeStep(Long user,TurnRecord row,TurnScope scope,boolean running,WorkflowContinuation expected){
        return executeStep(user,row,scope,running,expected,null);
    }
    private boolean executeStep(Long user,TurnRecord row,TurnScope scope,boolean running,WorkflowContinuation expected,AnswerDraft explanation){
        final long revision=expected.getRevision();final int cursor=expected.getCursor();final String stepId=expected.getSteps().get(cursor).getStepId();
        Supplier<Boolean> work=()->{
            WorkflowContinuation c=store.continuation(user,row.getId());
            // Resume-only guard under the same parent lock as the adapter. Confirmation
            // also accepts awaiting_confirmation, so withActiveParent alone is insufficient.
            if(c==null||c.getRevision()!=revision||c.getCursor()!=cursor||cursor>=c.getSteps().size())return false;
            WorkflowStep step=c.getSteps().get(cursor);if(!stepId.equals(step.getStepId())||!"pending".equals(step.getStatus()))return false;
            TurnView before=store.findTurn(user,row.getId());
            TurnResult outcome=registry.actionExecutor(step.getKind()).execute(user,step,scope);if(outcome==null)throw new IllegalStateException("缺少业务结果");
            if("completed".equals(outcome.getStatus())){
                String receipt=null;for(Card card:outcome.getCards())if(card.getReceiptRef()!=null&&!card.getReceiptRef().trim().isEmpty())receipt=card.getReceiptRef();if(receipt==null)throw new IllegalStateException("缺少业务回执");step.setStatus("completed");step.setReceiptRef(receipt);c.setCursor(c.getCursor()+1);outcome.setStatus(c.getCursor()==c.getSteps().size()?"completed":"awaiting_confirmation");
                String feedback="draft_update".equals(step.getKind())?"已更新本餐":"calendar_save".equals(step.getKind())?"已保存计划":"已加入采购清单";outcome.setReply(feedback+(c.getCursor()==c.getSteps().size()?"":"，正在准备下一步"));
                if("draft_update".equals(step.getKind())&&c.getCursor()==c.getSteps().size()&&explanation!=null){
                    ModelContext actual=new ModelContext();for(Card card:outcome.getCards())if("menu".equals(card.getType()))actual.getActiveMeal().put("currentDishes",card.getData().get("dishes"));
                    AssistantAnswerPolicy.Decision answer=new AssistantAnswerPolicy().evaluate(explanation,new AssistantAnswerBasisService(json).build(actual,Collections.emptyList()));
                    if(answer.isAccepted()){outcome.setReply(feedback+"。\n"+answer.getReply());applyCardLabels(outcome.getCards(),explanation);}
                }
            }else if("awaiting_confirmation".equals(outcome.getStatus())){PendingAction p=outcome.getPendingAction();if(p==null||!step.getStepId().equals(p.getStepId())||p.getTaskId()==null||p.getPreviewToken()==null||p.getExpiresAt()==null||p.getExpiresAt()<=clock.millis())throw new IllegalStateException("缺少确认预览");step.setStatus("awaiting_confirmation");step.setTaskId(p.getTaskId());boolean direct=directRequest(store.turnRequest(user,row.getId()));outcome.setReply(direct?"正在办理这次请求":"请核对以下内容后确认");if(direct){outcome.setRetryable(false);for(Card card:outcome.getCards())card.getData().put("executionMode","direct");}
            }else throw new IllegalStateException("业务结果无效");
            List<Card> cards=new ArrayList<>();for(Card card:before.getCards())if(card.getReceiptRef()!=null)cards.add(card);cards.addAll(outcome.getCards());outcome.setCards(cards);outcome.setContinuation(c);if(outcome.getWorkspaceRef()==null)outcome.setWorkspaceRef(before.getWorkspaceRef());
            if(running)store.completeTurn(user,row.getId(),"running",row.getLeaseToken(),outcome);else store.completeTurn(user,row.getId(),"awaiting_confirmation",outcome);return true;
        };
        return running?store.withActiveLease(user,row.getId(),row.getLeaseToken(),work):store.withActiveParent(user,row.getId(),stepId,work);
    }
    private TurnScope scope(Long user,TurnRecord row,TurnRequest request){TurnScope s=new TurnScope();s.setUserId(user);s.setTurnId(row.getId());s.setSessionId(row.getSessionId());s.setWorkspaceId(row.getWorkspaceId());s.setExpectedWorkspaceRevision(request.getExpectedWorkspaceRevision());s.setExpectedPlanVersion(request.getExpectedPlanVersion());return s;}
    private WorkspaceRef reference(TurnScope scope){WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(scope.getWorkspaceId());ref.setWorkspaceRevision(scope.getExpectedWorkspaceRevision());ref.setPlanVersion(scope.getExpectedPlanVersion());return ref;}
    private TurnResult result(String status,String reply,boolean retry){TurnResult r=new TurnResult();r.setStatus(status);r.setReply(reply);r.setRetryable(retry);return r;}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("数据无效");}}
    private void boundContext(ModelContext context){List<Map<String,Object>> text=new ArrayList<>(rows(context.getConversation().get("recentText")));while(encode(context).length()>6000&&!text.isEmpty()){text.remove(0);context.getConversation().put("recentText",text);context.getEvidence().put("truncated",true);}if(encode(context).length()>6000)throw new IllegalArgumentException("本餐必要信息较多，请缩小请求范围");}
    private void validateOutput(StepOutput output){
        if(output==null||!Arrays.asList("read_calls","final","need_input","navigation","action_invalid").contains(output.getType())||output.getReadCalls()==null)throw new IllegalArgumentException("结果类型无效");
        if("action_invalid".equals(output.getType())){
            if(output.getActionProposal()!=null||output.getAnswer()!=null||output.getQuestion()!=null||output.getReply()!=null||output.getFactSource()!=null||output.getClarificationKind()!=null||output.getNavigationIntent()!=null||output.getProviderContinuation()!=null||!output.getReadCalls().isEmpty())throw new IllegalArgumentException("内部纠正结果无效");
            return;
        }
        if(output.getFactSource()!=null&&(!"final".equals(output.getType())||!"recent_actual".equals(output.getFactSource())||output.getActionProposal()!=null))throw new IllegalArgumentException("查询来源无效");
        if("navigation".equals(output.getType())){
            if(output.getNavigationIntent()==null||output.getActionProposal()!=null||output.getQuestion()!=null||output.getReply()!=null||!output.getReadCalls().isEmpty()||output.getProviderContinuation()!=null)throw new IllegalArgumentException("交接内容冲突");
            return;
        }
        if(output.getNavigationIntent()!=null)throw new IllegalArgumentException("结果内容冲突");
        if("read_calls".equals(output.getType())){if(output.getActionProposal()!=null||output.getQuestion()!=null||output.getReply()!=null)throw new IllegalArgumentException("结果内容冲突");}
        else{if(!output.getReadCalls().isEmpty()||output.getProviderContinuation()!=null)throw new IllegalArgumentException("结果内容冲突");if("need_input".equals(output.getType())&&output.getActionProposal()!=null)throw new IllegalArgumentException("澄清不能附带操作");}
    }
    private List<ConversationFrame> frames(ModelContext context){List<ConversationFrame> out=new ArrayList<>();for(Map<String,Object> item:rows(context.getConversation().get("recentText"))){if(!Arrays.asList("user","assistant").contains(item.get("role")))continue;ConversationFrame f=new ConversationFrame();f.setRole((String)item.get("role"));f.setContent(String.valueOf(item.get("text")));out.add(f);}return out.size()>12?new ArrayList<>(out.subList(out.size()-12,out.size())):out;}
    private void authorizeCurrent(Map<String,Object> active,TurnScope scope){for(Map<String,Object> dish:rows(active.get("currentDishes")))addDishId(dish.get("id"),scope);}
    private void authorizeRead(ReadResult read,TurnScope scope){if(Arrays.asList("search_dishes","search_by_ingredients","get_dish_details","get_dish_methods","read_favorites").contains(read.getName()))for(Map<String,Object> item:read.getItems())addDishId(item.get("id"),scope);else if("read_current_meal".equals(read.getName()))for(Map<String,Object> item:read.getItems())authorizeCurrent(item,scope);}
    private com.eatwhat.dto.MealWorkspace contextWorkspace(Long user,TurnRequest request){return guidance.currentWorkspace(user,request);}
    private String originalIntent(ModelContext context,TurnRequest request){Object c=context.getRequestContext().get("clarification");Object original=c instanceof Map?((Map<?,?>)c).get("originalIntent"):null;return original instanceof String?(String)original:request.getMessage();}
    private void retainOriginalIntent(Card card,ModelContext context,TurnRequest request){if(card!=null&&"clarification".equals(card.getType())){
        card.getData().put("originalIntent",originalIntent(context,request));
        Object clarification=context.getRequestContext().get("clarification"),selection=clarification instanceof Map?((Map<?,?>)clarification).get("selection"):null;
        if(selection instanceof Map)card.getData().put("priorSelection",new LinkedHashMap<>((Map<?,?>)selection));
    }}
    private void addDishId(Object value,TurnScope scope){if(value instanceof Number&&((Number)value).longValue()>0)scope.getAuthorizedDishIds().add(((Number)value).longValue());}
    private void validateActions(ActionProposal proposal,TurnScope scope){
        if(proposal.getSteps().isEmpty()||proposal.getSteps().size()>3)throw new IllegalArgumentException("操作数量无效");
        for(int i=0;i<proposal.getSteps().size();i++){ActionIntent a=proposal.getSteps().get(i);if(a==null||a.getArguments()==null)throw new IllegalArgumentException("操作无效");registry.actionExecutor(a.getKind());Map<String,Object> args=a.getArguments();
            if("draft_update".equals(a.getKind())){if(i!=0)throw new IllegalArgumentException("请先调整本餐再确认保存");fields(args,"operation","contextPatch","targetDishId","targetConstraints","replacementDishId","selectedDishIds","keepDishIds","releaseDishIds");validateDraftShape(args);if(!Arrays.asList("generate","regenerate","adjust","undo").contains(args.get("operation")))throw new IllegalArgumentException("操作无效");for(String key:Arrays.asList("targetDishId","replacementDishId","selectedDishIds","keepDishIds","releaseDishIds")){Object value=args.get(key);if(value!=null){List<?> ids=value instanceof List?(List<?>)value:Collections.singletonList(value);if(ids.size()>10)throw new IllegalArgumentException("菜品过多");for(Object id:ids)if(!(id instanceof Integer||id instanceof Long)||!scope.getAuthorizedDishIds().contains(((Number)id).longValue()))throw new IllegalArgumentException("请先查询需要使用的菜品");}}}
            else if("calendar_save".equals(a.getKind())){fields(args,"sourceWorkspaceId","targetDate","targetMealType");if(args.containsKey("sourceWorkspaceId")&&!scope.getWorkspaceId().equals(args.get("sourceWorkspaceId")))throw new IllegalArgumentException("本餐来源无效");dateMeal(args,"targetDate","targetMealType");}
            else if("shopping_preview".equals(a.getKind())){fields(args,"sourceRef","selectedSourceKeys","excludedOwnedIngredients");if(args.containsKey("selectedSourceKeys"))stringList(args.get("selectedSourceKeys"),100,200);if(args.containsKey("excludedOwnedIngredients"))stringList(args.get("excludedOwnedIngredients"),30,40);Map<String,Object> source=map(args.get("sourceRef"));if("draft".equals(source.get("kind"))){fields(source,"kind","workspaceId");if(!scope.getWorkspaceId().equals(source.get("workspaceId")))throw new IllegalArgumentException("本餐来源无效");}else if("plan".equals(source.get("kind"))){fields(source,"kind","date","mealType");dateMeal(source,"date","mealType");}else throw new IllegalArgumentException("采购来源无效");}
            else throw new IllegalArgumentException("操作无效");
        }
    }
    private void dateMeal(Map<String,Object> args,String date,String meal){Object d=args.get(date);if(!(d instanceof String)||!java.time.LocalDate.parse((String)d).toString().equals(d)||!Arrays.asList("breakfast","lunch","dinner").contains(args.get(meal)))throw new IllegalArgumentException("日期或餐次无效");}
    private void validateDraftShape(Map<String,Object> args){
        for(String key:Arrays.asList("targetDishId","replacementDishId"))if(args.containsKey(key)&&!(args.get(key) instanceof Integer||args.get(key) instanceof Long))throw new IllegalArgumentException("菜品编号无效");
        if(args.containsKey("contextPatch")){Map<String,Object> patch=map(args.get("contextPatch"));fields(patch,"people","counts","compositionMode","criteria","totalCookMinutes","requirements","ownedIngredients");if(patch.containsKey("people"))integer(patch.get("people"),1,50);if(patch.get("totalCookMinutes")!=null)integer(patch.get("totalCookMinutes"),1,480);if(patch.containsKey("compositionMode")&&!Arrays.asList("auto","manual").contains(patch.get("compositionMode")))throw new IllegalArgumentException("人数和菜数设置无效");if(patch.containsKey("requirements"))boundedText(patch.get("requirements"),2000);if(patch.containsKey("ownedIngredients"))stringList(patch.get("ownedIngredients"),30,40);if(patch.containsKey("counts")){Map<String,Object> counts=map(patch.get("counts"));fields(counts,"meat","veg","soup","staple","dessert","side");int total=0;for(Object value:counts.values())total+=integer(value,0,10);if(total>10)throw new IllegalArgumentException("本餐最多十道菜");}if(patch.containsKey("criteria"))criteria(map(patch.get("criteria")));}
        if(args.containsKey("targetConstraints"))criteria(map(args.get("targetConstraints")));
        for(String key:Arrays.asList("selectedDishIds","keepDishIds","releaseDishIds"))if(args.containsKey(key)&&!(args.get(key) instanceof List))throw new IllegalArgumentException("菜品列表无效");
    }
    private void criteria(Map<String,Object> value){fields(value,"cuisineCodes","includeTagCodes","excludeTagCodes","excludedIngredients","maxCookMinutes");for(String key:Arrays.asList("cuisineCodes","includeTagCodes","excludeTagCodes","excludedIngredients"))if(value.get(key)!=null)stringList(value.get(key),30,40);if(value.get("maxCookMinutes")!=null)integer(value.get("maxCookMinutes"),1,240);}
    private int integer(Object value,int min,int max){if(!(value instanceof Integer||value instanceof Long)||((Number)value).longValue()<min||((Number)value).longValue()>max)throw new IllegalArgumentException("数值范围无效");return ((Number)value).intValue();}
    private void boundedText(Object value,int limit){if(!(value instanceof String)||((String)value).length()>limit)throw new IllegalArgumentException("文字内容无效");}
    private void stringList(Object value,int limit,int length){if(!(value instanceof List)||((List<?>)value).size()>limit)throw new IllegalArgumentException("列表内容无效");for(Object item:(List<?>)value){boundedText(item,length);if(((String)item).trim().isEmpty())throw new IllegalArgumentException("列表内容无效");}}
    private void fields(Map<String,Object> value,String... fields){if(!new HashSet<>(Arrays.asList(fields)).containsAll(value.keySet()))throw new IllegalArgumentException("操作字段无效");}
    @SuppressWarnings("unchecked") private Map<String,Object> map(Object value){if(!(value instanceof Map))throw new IllegalArgumentException("操作内容无效");return (Map<String,Object>)value;}
    @SuppressWarnings("unchecked") private List<Map<String,Object>> rows(Object value){return value instanceof List?(List<Map<String,Object>>)value:Collections.emptyList();}
    private void validateContinuation(ProviderContinuation next,List<ToolRead> calls,ProviderContinuation previous,List<ReadResult> results){
        if(next==null||next.getMessages()==null||next.getMessages().isEmpty()||next.getMessages().size()>16||encode(next).length()>300000)throw new IllegalArgumentException("续接内容无效");
        List<Map<String,Object>> frames=next.getMessages();if(!frames.get(frames.size()-1).equals(next.getAssistantMessage()))throw new IllegalArgumentException("续接内容无效");
        List<Map<String,Object>> prefix=new ArrayList<>();if(previous!=null){prefix.addAll(previous.getMessages());for(ReadResult result:results){Map<String,Object> f=new LinkedHashMap<>();f.put("role","tool");f.put("tool_call_id",result.getCallId());f.put("content",encode(result));prefix.add(f);}}
        if(frames.size()!=prefix.size()+1)throw new IllegalArgumentException("续接内容不完整");for(int i=0;i<prefix.size();i++){Map<String,Object> expected=prefix.get(i),actual=frames.get(i);if("tool".equals(expected.get("role"))){if(!Objects.equals(expected.get("role"),actual.get("role"))||!Objects.equals(expected.get("tool_call_id"),actual.get("tool_call_id")))throw new IllegalArgumentException("工具续接不匹配");try{if(!json.readTree((String)expected.get("content")).equals(json.readTree((String)actual.get("content"))))throw new IllegalArgumentException();}catch(Exception ex){throw new IllegalArgumentException("工具结果被修改");}}else if(!expected.equals(actual))throw new IllegalArgumentException("续接内容被修改");}
        Map<String,Object> assistant=next.getAssistantMessage();if(!"assistant".equals(assistant.get("role")))throw new IllegalArgumentException("续接角色无效");List<Map<String,Object>> protocol=rows(assistant.get("tool_calls"));if(protocol.size()!=calls.size())throw new IllegalArgumentException("工具数量不一致");for(int i=0;i<calls.size();i++){ToolRead call=calls.get(i);Map<String,Object> p=protocol.get(i),function=map(p.get("function"));if(!Objects.equals(call.getCallId(),p.get("id"))||!Objects.equals(call.getName(),function.get("name")))throw new IllegalArgumentException("工具不一致");try{if(!json.readTree((String)function.get("arguments")).equals(json.valueToTree(call.getArguments())))throw new IllegalArgumentException();}catch(Exception ex){throw new IllegalArgumentException("工具参数不一致");}}
    }
    private List<Card> factCards(Long user,ReadResult read){
        Card card=new Card();card.setId("read-"+read.getCallId());card.setType("receipt");card.getData().put("kind","readonly_fact");card.getData().put("truncated",read.isTruncated());card.setText(read.isTruncated()?"以下为部分查询结果，可继续缩小范围查询":null);
        if(Arrays.asList("search_dishes","search_by_ingredients","get_dish_details","get_dish_methods","read_favorites").contains(read.getName())){card.setType("recipe");card.setTitle("read_favorites".equals(read.getName())?"我的收藏":Arrays.asList("get_dish_details","get_dish_methods").contains(read.getName())?"菜谱详情与做法":"菜谱查询");List<Map<String,Object>> display=displayDishes(user,read.getItems());if(display.size()>12){display=new ArrayList<>(display.subList(0,12));card.getData().put("truncated",true);card.setText("以下为部分查询结果，可缩小范围继续查询");}card.getData().put("dishes",display);}
        else if("read_saved_menus".equals(read.getName())){card.setType("personal_menu");card.setTitle("常用菜单");card.getData().put("menus",read.getItems());List<String> lines=new ArrayList<>();for(Map<String,Object> menu:read.getItems()){String name=humanLabel(menu.get("name"));if(name.isEmpty())continue;Object people=menu.get("people"),ids=menu.get("dishIds");lines.add(name+(people instanceof Number&&((Number)people).intValue()>0?" · "+people+"人":"")+(ids instanceof List?" · "+((List<?>)ids).size()+"道菜":""));}card.setText(readableLines(lines,read.isTruncated()));}
        else if("get_recommendation_options".equals(read.getName())){card.setType("recommendation_options");card.setTitle("可选筛选条件");card.getData().put("options",read.getItems());Map<String,List<String>> groups=new LinkedHashMap<>();for(Map<String,Object> item:read.getItems()){String group=optionGroup(item.get("group"));if(group.isEmpty())continue;List<String> labels=groups.computeIfAbsent(group,k->new ArrayList<>());String label=humanLabel(item.get("label"));if(!label.isEmpty()&&!labels.contains(label))labels.add(label);}List<String> lines=new ArrayList<>();for(Map.Entry<String,List<String>> group:groups.entrySet())lines.add(group.getKey()+(group.getValue().isEmpty()?"":"："+String.join("、",group.getValue())));card.setText(readableLines(lines,read.isTruncated()));}
        else if("read_current_meal".equals(read.getName())){card.setType("menu");card.setTitle("当前餐");if(!read.getItems().isEmpty()){Map<String,Object> meal=read.getItems().get(0);card.getData().put("dishes",displayDishes(user,rows(meal.get("currentDishes"))));copyFields(meal,card.getData(),"date","mealType","people");}}
        else if("read_shopping".equals(read.getName())){card.setTitle("采购清单");List<Map<String,Object>> items=new ArrayList<>();for(Map<String,Object> source:read.getItems()){Map<String,Object> item=new LinkedHashMap<>();copyFields(source,item,"name","quantityText","quantityProvenance");item.put("quantity",source.get("quantityValue"));item.put("unit",source.get("unitCode"));item.put("price",null);item.put("selected",false);item.put("checked",source.get("checked"));items.add(item);}card.getData().put("items",items);}
        else if(Arrays.asList("read_calendar","read_actual_diet_review").contains(read.getName())){card.setTitle("read_calendar".equals(read.getName())?"日历记录":"实际用餐记录");if("read_actual_diet_review".equals(read.getName()))card.setText("仅统计明确记录为已吃的餐次"+(read.isTruncated()?"，以下为部分日期结果":""));List<Map<String,Object>> meals=new ArrayList<>();for(Map<String,Object> day:read.getItems()){
            for(Map<String,Object> plan:rows(day.get("plans"))){Map<String,Object> meal=new LinkedHashMap<>();meal.put("date",day.get("date"));copyFields(plan,meal,"mealType","people","name");meal.put("status","planned");List<Map<String,Object>> refs=new ArrayList<>();Object ids=plan.get("dishIds");if(ids instanceof List)for(Object id:(List<?>)ids){Map<String,Object> ref=new LinkedHashMap<>();ref.put("id",id);refs.add(ref);}meal.put("dishes",displayDishes(user,refs));meals.add(meal);}
            for(Map<String,Object> actual:rows(day.get("actual"))){Map<String,Object> meal=new LinkedHashMap<>();meal.put("date",day.get("date"));copyFields(actual,meal,"mealType");meal.put("people",null);meal.put("status","eaten");meal.put("dishes",displayDishes(user,rows(actual.get("dishes"))));meals.add(meal);}
        }card.getData().put("meals",meals);}
        else return Collections.emptyList();
        if(read.getItems().isEmpty())card.setText("这个范围内暂无记录");return Collections.singletonList(card);
    }
    private String safeQuestion(String value){if(value==null||value.trim().isEmpty()||value.length()>200||value.contains("://")||value.matches("(?s).*(?:[<>]|已(?:经)?(?:保存|采购|加入|记录|修改|更新)).*"))return SAFE_QUESTION;return value.trim();}
    static void applyCardLabels(List<Card> cards,AnswerDraft answer){
        if(answer==null||answer.getCardLabels()==null)return;
        Map<String,String> labels=new HashMap<>();for(CardLabel label:answer.getCardLabels())labels.put(label.getDishRef(),label.getTitle().trim());
        for(Card card:cards){Object value=card.getData().get("dishes");if(!(value instanceof List))continue;
            List<Map<String,Object>> displayed=new ArrayList<>();for(Object row:(List<?>)value){if(!(row instanceof Map))continue;Map<String,Object> dish=new LinkedHashMap<>((Map<String,Object>)row);Object id=dish.get("id");String title=labels.get("dish:"+id);if(title!=null){dish.put("sourceName",dish.get("name"));dish.put("name",title);}displayed.add(dish);}card.getData().put("dishes",displayed);
        }
    }
    private List<Card> selectAnswerDishCards(List<Card> cards,List<String> refs){
        if(refs.isEmpty())return cards;Set<Long> ids=new HashSet<>();for(String ref:refs)if(ref.startsWith("dish:"))ids.add(Long.valueOf(ref.substring(5)));
        List<Card> selected=new ArrayList<>();for(Card card:cards){
            if(!"recipe".equals(card.getType())||!"readonly_fact".equals(card.getData().get("kind"))){selected.add(card);continue;}
            List<Map<String,Object>> dishes=new ArrayList<>();for(Map<String,Object> dish:rows(card.getData().get("dishes")))if(dish.get("id") instanceof Number&&ids.contains(((Number)dish.get("id")).longValue()))dishes.add(dish);
            if(!dishes.isEmpty()){card.getData().put("dishes",dishes);selected.add(card);}
        }return selected;
    }
    private String humanLabel(Object value){if(!(value instanceof String))return "";String text=((String)value).replaceAll("[\\p{Cntrl}]","").trim();return text.length()>120?text.substring(0,120)+"…":text;}
    private String readableLines(List<String> lines,boolean partial){String text=String.join("\n",lines);return text+(partial?"\n以上为部分结果，可缩小范围继续查询":"");}
    private String optionGroup(Object value){if("cuisine".equals(value))return "菜系";if("flavor".equals(value))return "口味";if("scene".equals(value))return "用餐场景";if("diet".equals(value))return "饮食偏好";if("method".equals(value))return "做法";return "";}
    /** Only a source selector crosses the model boundary; rows remain server-authorized context facts. */
    private ReadResult recentActualRead(ModelContext context){
        ReadResult read=new ReadResult();read.setCallId("context-recent-actual");read.setName("read_actual_diet_review");
        read.setTruncated(Boolean.TRUE.equals(context.getEvidence().get("truncated")));
        Map<Object,List<Map<String,Object>>> byDay=new LinkedHashMap<>();
        for(Map<String,Object> actual:context.getRecentActual()){
            if(!"eaten".equals(actual.get("status")))continue;
            byDay.computeIfAbsent(actual.get("date"),key->new ArrayList<>()).add(actual);
        }
        for(Map.Entry<Object,List<Map<String,Object>>> entry:byDay.entrySet()){Map<String,Object> day=new LinkedHashMap<>();day.put("date",entry.getKey());day.put("actual",entry.getValue());read.getItems().add(day);}
        return read;
    }
    private List<Card> recentActualCards(Long user,ModelContext context,ReadResult read){
        List<Card> cards=factCards(user,read);
        for(Card card:cards){
            card.getData().put("factSource","recent_actual");
            Object range=context.getEvidence().get("recentActualRange");
            if(range instanceof Map)card.getData().put("range",new LinkedHashMap<>((Map<?,?>)range));
            if(read.isTruncated())card.setText("以下为部分实际用餐记录，可缩小日期范围继续查询");
        }
        return cards;
    }
    private List<Map<String,Object>> displayDishes(Long user,List<Map<String,Object>> source){
        List<Long> ids=new ArrayList<>();for(Map<String,Object> row:source){Object id=row.containsKey("id")?row.get("id"):row.get("dishId");if(id instanceof Number&&((Number)id).longValue()>0)ids.add(((Number)id).longValue());}
        Map<Long,Dish> fetched=new HashMap<>();if(!ids.isEmpty())for(Dish dish:dishes.getDishesByIdsForUser(ids,user)){AssistantV4ContextService.checkDish(dish,user);if(ids.contains(dish.getId()))fetched.put(dish.getId(),dish);}
        List<Map<String,Object>> out=new ArrayList<>();for(Map<String,Object> row:source){Map<String,Object> display=new LinkedHashMap<>();copyFields(row,display,"id","dishId","name","type");Object id=row.containsKey("id")?row.get("id"):row.get("dishId");Dish dish=id instanceof Number?fetched.get(((Number)id).longValue()):null;display.put("image",dish==null?null:dish.getImage());if(dish!=null&&display.get("name")==null)display.put("name",dish.getName());
            List<Map<String,Object>> ingredients=new ArrayList<>();for(Map<String,Object> fact:rows(row.get("ingredientFacts"))){Map<String,Object> ingredient=new LinkedHashMap<>();copyFields(fact,ingredient,"name","unit");ingredient.put("quantity",fact.get("quantityValue"));ingredients.add(ingredient);}if(ingredients.isEmpty()&&row.get("ingredients") instanceof String){Map<String,Object> ingredient=new LinkedHashMap<>();ingredient.put("name",row.get("ingredients"));ingredient.put("quantity",null);ingredient.put("unit",null);ingredients.add(ingredient);}display.put("ingredients",ingredients);
            Object steps=row.get("steps");if(!(steps instanceof String)||((String)steps).trim().isEmpty())steps=row.get("methods");display.put("steps",stepLines(steps));out.add(display);
        }return out;
    }
    private List<String> stepLines(Object value){if(!(value instanceof String)||((String)value).trim().isEmpty())return Collections.emptyList();String text=(String)value;try{com.fasterxml.jackson.databind.JsonNode node=json.readTree(text);if(node.isArray()){List<String> out=new ArrayList<>();for(com.fasterxml.jackson.databind.JsonNode n:node)if(n.isTextual())out.add(n.asText());if(!out.isEmpty())return out;}}catch(Exception ignored){}return Arrays.asList(text.split("\\r?\\n"));}
    private void copyFields(Map<String,Object> from,Map<String,Object> to,String... keys){for(String key:keys)if(from.containsKey(key))to.put(key,from.get(key));}
    private void mergeFacts(List<Card> existing,List<Card> incoming){
        for(Card next:incoming){
            boolean explicit="recipe".equals(next.getType())&&"菜谱详情与做法".equals(next.getTitle());
            Card old=null;
            if("recipe".equals(next.getType()))for(Card card:existing)
                if("recipe".equals(card.getType())&&Objects.equals(next.getTitle(),card.getTitle())){old=card;break;}
            // Explicitly requested answers have their own bounded card. Search candidates
            // cannot consume the space needed by a later detail/method response.
            if(old==null){existing.add(next);continue;}
            List<Map<String,Object>> merged=rows(old.getData().get("dishes"));
            for(Map<String,Object> dish:rows(next.getData().get("dishes"))){
                Map<String,Object> previous=null;for(Map<String,Object> candidate:merged)
                    if(Objects.equals(candidate.get("id"),dish.get("id"))){previous=candidate;break;}
                if(previous!=null){
                    for(Map.Entry<String,Object> field:dish.entrySet())if(field.getValue()!=null&&(!(field.getValue() instanceof List)||!((List<?>)field.getValue()).isEmpty()))previous.put(field.getKey(),field.getValue());
                }else{
                    if(merged.size()>=12){
                        old.getData().put("truncated",true);old.setText("以下为部分查询结果，可缩小范围继续查询");
                        if(explicit)merged.remove(0);else continue;
                    }
                    merged.add(dish);
                }
            }
            if(Boolean.TRUE.equals(next.getData().get("truncated"))){old.getData().put("truncated",true);old.setText(next.getText());}
        }
    }
}
