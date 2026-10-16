package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.WorkspaceTask;
import com.eatwhat.mapper.MealWorkspaceMapper;
import com.fasterxml.jackson.databind.*;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.*;
import javax.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
@Service
public class MealWorkspaceTaskRunner {
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;

    private static final Logger LOG=LoggerFactory.getLogger(MealWorkspaceTaskRunner.class);
    private final MealWorkspaceMapper db;
    private final MealWorkspaceService service;
    private final MealWorkspacePlanner planner;
    private final MealWorkspaceAgentGateway agent;
    private final ObjectMapper json;
    private final boolean enabled;
    @org.springframework.beans.factory.annotation.Autowired
    private PersonalMenuService personalMenus;
    private java.time.Clock clock=java.time.Clock.systemUTC();
    private final Set<String> submitted=ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor executor=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(8),new ThreadPoolExecutor.AbortPolicy());
    public MealWorkspaceTaskRunner(MealWorkspaceMapper db,MealWorkspaceService service,MealWorkspacePlanner planner,MealWorkspaceAgentGateway agent,ObjectMapper json,@Value("${meal-workspace.enabled:false}") boolean enabled) {
        this.db=db;this.service=service;this.planner=planner;this.agent=agent;this.json=json;this.enabled=enabled;
    }
    /** A committed identity is a wakeup signal, never permission to jump the queue. */
    public static final class Ready {
        final String id,workspace;final Long user;
        Ready(String id,String workspace,Long user){this.id=id;this.workspace=workspace;this.user=user;}
    }
    @org.springframework.transaction.event.TransactionalEventListener(phase=org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void ready(Ready event){
        // Preserve the existing durable ordering when a previously rejected
        // task is still waiting. New notifications must not bypass that work.
        poll();
    }
    private boolean submit(String id,java.util.function.Supplier<WorkspaceTask> source){
        if(!submitted.add(id))return true;
        try{
            executor.execute(()->{try{WorkspaceTask task=source.get();if(task!=null)execute(task);}
                catch(RuntimeException deferred){LOG.warn("workspace_dispatch_deferred kind={}",deferred.getClass().getSimpleName());}
                finally{submitted.remove(id);}});
            return true;
        }catch(RejectedExecutionException full){submitted.remove(id);return false;}
    }
    @Scheduled(fixedDelay=250,initialDelay=1000)
    public void poll() {
        if(!enabled)return;
        try {
            for(WorkspaceTask task:db.pending()) {
                if(!submit(task.getId(),()->task))break;
            }
        } catch(Exception e) {LOG.warn("workspace_poll_failed kind={}",e.getClass().getSimpleName());}
    }
    void execute(WorkspaceTask task) {
        task.setLeaseToken(UUID.randomUUID().toString());
        final boolean recovered;
        try{
            // Classify the winning guarded UPDATE, never the stale pending() snapshot.
            // At most one queued attempt and one expired-running attempt; no retry loop.
            if(db.claimQueued(task.getId(),task.getLeaseToken())==1)recovered=false;
            else if(db.claimExpired(task.getId(),task.getLeaseToken())==1)recovered=true;
            else return;
        }
        catch(org.springframework.dao.TransientDataAccessException contention){
            // No provider or domain action has started. Keep the same durable task
            // for the bounded poller/lease recovery instead of killing a worker.
            LOG.info("workspace_claim_deferred kind={}",contention.getClass().getSimpleName());return;
        }
        long observedStart=clock.millis();String observedOutcome=recovered?"recover":"success";
        if(!recovered&&task.getCreatedAt()!=null)ExperienceMetrics.observe(metrics,"assistant_queue","success",observedStart-task.getCreatedAt().getTime(),1);
        long started=System.nanoTime();
        MealWorkspace w=null;WorkspaceRequest r=null;
        try {
            JsonNode input=json.readTree(task.getInputJson());w=json.treeToValue(input.get("workspace"),MealWorkspace.class);r=json.treeToValue(input.get("request"),WorkspaceRequest.class);
            MealContext interpreted=null;PlanDraft draft;
            if(Arrays.asList("generate","regenerate").contains(r.getCommand())&&!w.getContext().getRequirements().trim().isEmpty()) {
                Map<String,Object> response=agent.run(task.getUserId(),w);
                if(!Boolean.FALSE.equals(response.get("needsInput")) || !Boolean.TRUE.equals(response.get("constraintsUnderstood"))) {
                    Map<String,String> target=null;
                    if(response.get("suggestedTarget") instanceof Map) {
                        Map<?,?> proposal=(Map<?,?>)response.get("suggestedTarget");
                        MealContext proposed=json.convertValue(w.getContext(),MealContext.class);
                        proposed.setDate(String.valueOf(proposal.get("date")));proposed.setMealType(String.valueOf(proposal.get("mealType")));
                        MealWorkspaceRules.normalize(proposed);
                        target=new LinkedHashMap<>();target.put("date",proposed.getDate());target.put("mealType",proposed.getMealType());
                    }
                    if(target==null&&tryRulesFallback(task,w,r)){observedOutcome="recover";return;}
                    observedOutcome="error";
                    service.finish(task,null,null,"请确认目标餐次或补充明确限制后重试","needs_input",target);return;
                }
                interpreted=json.convertValue(w.getContext(),MealContext.class);
                RecommendationCriteria extra=json.convertValue(response.get("criteria"),RecommendationCriteria.class);
                if(extra==null)extra=new RecommendationCriteria();
                // Merge restrictions rather than allowing model output to relax user-set criteria.
                EffectiveRecommendationCriteria merged=new RecommendationCriteriaResolver().resolve(extra,asPreference(interpreted.getCriteria()),false);
                List<String> existingCuisines=interpreted.getCriteria().getCuisineCodes();
                if(!existingCuisines.isEmpty()) {
                    List<String> intersection=new ArrayList<>(existingCuisines);
                    if(!extra.getCuisineCodes().isEmpty())intersection.retainAll(extra.getCuisineCodes());
                    if(intersection.isEmpty())throw new IllegalArgumentException("文字中的菜系与本餐设置冲突，请明确选择");
                    merged.setCuisineCodes(intersection);
                }
                List<String> tags=new ArrayList<>(extra.getIncludeTagCodes());
                if(!interpreted.getCriteria().getIncludeTagCodes().isEmpty()) {
                    if(tags.isEmpty())tags.addAll(interpreted.getCriteria().getIncludeTagCodes());
                    else tags.retainAll(interpreted.getCriteria().getIncludeTagCodes());
                    if(tags.isEmpty())throw new IllegalArgumentException("文字中的标签与本餐设置冲突，请明确选择");
                }
                merged.setIncludeTagCodes(tags);
                RecommendationCriteria strict=new RecommendationCriteria();strict.setCuisineCodes(merged.getCuisineCodes());strict.setIncludeTagCodes(merged.getIncludeTagCodes());strict.setExcludeTagCodes(merged.getExcludeTagCodes());strict.setExcludedIngredients(merged.getExcludedIngredients());strict.setMaxCookMinutes(merged.getMaxCookMinutes());
                interpreted.setCriteria(strict);
                if(response.get("totalCookMinutes")!=null) {
                    Integer limit=json.convertValue(response.get("totalCookMinutes"),Integer.class);
                    interpreted.setTotalCookMinutes(interpreted.getTotalCookMinutes()==null?limit:Math.min(limit,interpreted.getTotalCookMinutes()));
                }
                MealWorkspaceRules.normalize(interpreted);w.setContext(interpreted);
                List<Long> ids=new ArrayList<>();for(Object id:(List<?>)response.get("dishIds")) ids.add(json.convertValue(id,Long.class));
                if(!ids.containsAll(w.getDraft().getLockedDishIds()))throw new IllegalArgumentException("智能结果未保留指定菜品，原方案已保留");
                draft=planner.validateAgent(task.getUserId(),w,ids);draft.setSource("agent");
            } else {draft=planner.generate(task.getUserId(),w,r.getCommand(),r.getDishId(),r.getDishIds());if("select".equals(r.getCommand()))interpreted=w.getContext();}
            if (r.getMenuId() != null) {
                if (!"select".equals(r.getCommand())) throw new IllegalArgumentException("菜单只能用于选菜草稿");
                personalMenus.validateDraft(task.getUserId(), r.getMenuId(), r.getMenuVersion(),
                    r.getMenuDate(), r.getMenuMealType(), w.getContext(), draft.getDishes());
            } else if (r.getMenuVersion() != null || r.getMenuDate() != null || r.getMenuMealType() != null) {
                throw new IllegalArgumentException("菜单交接信息不完整，请重新选择");
            }
            service.finish(task,interpreted,draft,"方案已准备好，请确认本餐安排","draft");
            LOG.info("workspace_task_finished taskId={} mode={} elapsedMs={}",task.getId(),draft.getSource(),(System.nanoTime()-started)/1000000);
        } catch(MealConsumptionService.VersionConflict e) {observedOutcome="error";service.finish(task,null,null,e.getMessage(),"needs_input");}
        catch(org.springframework.web.server.ResponseStatusException e) {observedOutcome="error";service.finish(task,null,null,e.getReason(),"needs_input");}
        catch(IllegalArgumentException e) {observedOutcome="error";service.finish(task,null,null,e.getMessage(),"needs_input");}
        catch(Exception e) {
            observedOutcome=Thread.currentThread().isInterrupted()?"cancel":"error";
            LOG.warn("workspace_task_failed taskId={} kind={}",task.getId(),e.getClass().getSimpleName());
            if(tryRulesFallback(task,w,r)){observedOutcome="recover";return;}
            service.finish(task,null,null,"本次安排未完成，原方案已保留。请明确本餐限制后重试","needs_input");
        }finally{if("discarded".equals(task.getStatus())||"cancelled".equals(task.getStatus()))observedOutcome="cancel";ExperienceMetrics.observe(metrics,"task_execution",observedOutcome,clock.millis()-observedStart,1);}
    }
    boolean tryRulesFallback(WorkspaceTask task,MealWorkspace w,WorkspaceRequest request) {
        // Reuse only previously interpreted restrictions; never discard unknown free-text limits.
        if(w==null||request==null||!Arrays.asList("generate","regenerate").contains(request.getCommand())
                ||!MealWorkspaceRules.matchesContext(w.getDraft(),w.getContext())
                ||!MealWorkspaceRules.understandsRequirements(w.getDraft(),w.getContext()))return false;
        try {
            PlanDraft draft=planner.generate(task.getUserId(),w,request.getCommand(),null,null);
            draft.setSource("rules-fallback");
            List<String> explanations=new ArrayList<>(draft.getExplanations());explanations.add("智能服务暂不可用，已按此前校验的限制使用规则搭配");draft.setExplanations(explanations);
            service.finish(task,null,draft,"已按已知限制完成规则搭配，请核对后确认","draft");
            return true;
        } catch(IllegalArgumentException e) {
            LOG.info("workspace_rule_fallback_unavailable taskId={} kind={}",task.getId(),e.getClass().getSimpleName());
            return false;
        }
    }
    private UserPreferenceDTO asPreference(RecommendationCriteria c) {UserPreferenceDTO p=new UserPreferenceDTO();p.setExcludedIngredients(c.getExcludedIngredients());p.setExcludedTagCodes(c.getExcludeTagCodes());p.setMaxCookMinutes(c.getMaxCookMinutes());return p;}
    @Scheduled(fixedDelay=3600000,initialDelay=60000) public void cleanup(){if(enabled){db.expireDrafts();db.purgeTaskInputs();db.purgeEvents();}}
    @PreDestroy public void close(){executor.shutdownNow();}
}
