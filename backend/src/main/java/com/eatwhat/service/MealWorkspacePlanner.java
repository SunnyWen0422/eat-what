package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.MealConsumption;
import com.eatwhat.mapper.DishMapper;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;
@Service
public class MealWorkspacePlanner {
    private enum SelectionOrigin { AUTOMATIC, USER_SELECTION }
    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}
    private Dish enrich(Dish dish){return quality==null?dish:quality.enrich(dish);}
    private List<Dish> enrich(List<Dish> dishes){return quality==null?dishes:quality.enrich(dishes);}
    List<Dish> attachQuality(Long user,List<Dish> selected) { return enrich(candidates.detailsForFacts(user,selected)); }
    private final DishCandidateQueryService candidates;
    private final DishMapper dishes;
    private final UserPreferenceService preferences;
    private final RecommendationMetadataService metadata;
    private final FavoriteDishService favorites;
    private final MealConsumptionMapper actual;
    private final ObjectMapper json;
    @org.springframework.beans.factory.annotation.Autowired(required=false) private com.eatwhat.mapper.RecipeRecordMapper calendar;
    @org.springframework.beans.factory.annotation.Autowired(required=false) private RecommendationLearningService learning;
    public MealWorkspacePlanner(DishCandidateQueryService candidates,DishMapper dishes,UserPreferenceService preferences,RecommendationMetadataService metadata,
                                FavoriteDishService favorites,MealConsumptionMapper actual,ObjectMapper json) {
        this.candidates=candidates;this.dishes=dishes;this.preferences=preferences;this.metadata=metadata;
        this.favorites=favorites;this.actual=actual;this.json=json;
    }
    public List<Dish> eligible(Long user,MealContext c) {
        return eligible(user,c,SelectionOrigin.AUTOMATIC);
    }
    public void validateContext(MealContext c){
        if(!metadata.validateCriteria(c.getCriteria()).isEmpty()||!metadata.validateCriteria(c.getRecommendationPreferences()).isEmpty())throw new IllegalArgumentException("本餐条件包含无效的标签或用时，请在设置中核对");
    }
    public List<String> mergeRequiredTags(List<String> existing,List<String> added){return new BalancedRecommendationPolicy(metadata).mergeRequiredTags(existing,added);}
    public boolean preservesRequiredTags(List<String> existing,List<String> next){return new BalancedRecommendationPolicy(metadata).preservesRequiredTags(existing,next);}
    private List<Dish> eligible(Long user,MealContext c,SelectionOrigin origin) {
        return rank(user,c,origin).pool;
    }
    private static class RankedCandidates{
        final List<Dish> pool;final EffectiveRecommendationCriteria criteria;final Set<Long> recent;
        RankedCandidates(List<Dish> pool,EffectiveRecommendationCriteria criteria,Set<Long> recent){this.pool=pool;this.criteria=criteria;this.recent=recent;}
    }
    private RankedCandidates rank(Long user,MealContext c,SelectionOrigin origin) {
        if(!metadata.validateCriteria(c.getCriteria()).isEmpty()||!metadata.validateCriteria(c.getRecommendationPreferences()).isEmpty())throw new IllegalArgumentException("本餐条件包含无效的标签或用时，请在设置中核对");
        EffectiveRecommendationCriteria criteria=new RecommendationCriteriaResolver().resolveMeal(c,preferences.get(user));
        List<Dish> pool=new ArrayList<>(candidates.findRawForUser(user,null,null,criteria,Integer.MAX_VALUE));
        if(BalancedRecommendationPolicy.enabled(c)){BalancedRecommendationPolicy policy=new BalancedRecommendationPolicy(metadata);pool.removeIf(d->!policy.matchesRequiredGroups(d,c));}
        if(origin==SelectionOrigin.AUTOMATIC)pool.removeIf(d->!CanonicalRecommendationFacts.automatic(d,c.getMealType()));
        if("favorites".equals(c.getCandidateScope())){Set<Long> scope=new HashSet<>(favorites.getFavoriteDishIds(user));pool.removeIf(d->!scope.contains(d.getId()));}
        Set<Long> recentIds=recentDishIds(user,c,criteria.getAvoidRecentDays());
        pool.sort(Comparator.comparing(Dish::getId));
        return new RankedCandidates(pool,criteria,recentIds);
    }
    private RankedCandidates selected(Long user,MealContext c,SelectionOrigin origin,List<Long> requested,Set<Long> locked){
        if(!metadata.validateCriteria(c.getCriteria()).isEmpty())throw new IllegalArgumentException("本餐条件包含无效的标签或用时，请在设置中核对");
        EffectiveRecommendationCriteria criteria=new RecommendationCriteriaResolver().resolveMeal(c,preferences.get(user));
        LinkedHashSet<Long> ids=new LinkedHashSet<>(locked);if(requested!=null)ids.addAll(requested);
        List<Dish> pool=new ArrayList<>(candidates.findSelectedForUser(user,new ArrayList<>(ids),criteria));
        if(BalancedRecommendationPolicy.enabled(c)){BalancedRecommendationPolicy policy=new BalancedRecommendationPolicy(metadata);pool.removeIf(d->!policy.matchesRequiredGroups(d,c));}
        if(origin==SelectionOrigin.AUTOMATIC)pool.removeIf(d->!CanonicalRecommendationFacts.automatic(d,c.getMealType()));
        return new RankedCandidates(pool,criteria,recentDishIds(user,c,criteria.getAvoidRecentDays()));
    }
    private Set<Long> recentDishIds(Long user,MealContext context,Integer days) {
        if (days == null || days <= 0) return Collections.emptySet();
        java.time.LocalDate end=MealConsumptionService.date(context.getDate());
        java.time.LocalDate today=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"));
        if(end.isAfter(today))end=today;
        java.time.LocalDate start=end.minusDays(Math.min(30,days)-1);
        Set<Long> ids=new HashSet<>();
        for (MealConsumption meal:actual.range(user,start.toString(),end.toString())) {
            if (!"recorded".equals(meal.getStatus())) continue;
            try {
                List<Map<String,Object>> entries=json.readValue(meal.getActualDishesJson(),new TypeReference<List<Map<String,Object>>>(){});
                ids.addAll(new RecommendationScorer().recentActualIds(meal.getStatus(),entries));
            } catch (Exception error) { throw new IllegalStateException("近期餐次记录无法读取",error); }
        }
        return ids;
    }
    private Set<Long> nearbyPlans(Long user,MealContext c){
        Set<Long> ids=new HashSet<>();if(calendar==null)return ids;java.time.LocalDate date=java.time.LocalDate.parse(c.getDate());
        for(com.eatwhat.entity.RecipeRecord record:calendar.selectRecordsByUserAndRange(user,date.minusDays(1).toString(),date.plusDays(1).toString())){
            if(c.getDate().equals(record.getRecordDateString())&&c.getMealType().equals(record.getMealType()))continue;
            if(record.getDishIds()!=null)ids.addAll(record.getDishIds());
        }return ids;
    }
    private PlanDraft automatic(Long user,MealWorkspace w,RankedCandidates ranked,String command,Long target){
        MealContext c=w.getContext();PlanDraft prior=w.getDraft();
        if(!"replace".equals(command)&&!prior.getLockedDishIds().isEmpty()){
            // A candidate scope limits automatic new choices, not an explicitly
            // retained dish. Retained items still pass access and hard constraints.
            Set<Long> existing=ranked.pool.stream().map(Dish::getId).collect(Collectors.toSet()),missing=new LinkedHashSet<>(prior.getLockedDishIds());missing.removeAll(existing);
            if(!missing.isEmpty()){
                List<Dish> retained=selected(user,c,SelectionOrigin.USER_SELECTION,Collections.emptyList(),missing).pool;
                Set<Long> valid=retained.stream().map(Dish::getId).collect(Collectors.toSet());if(!valid.containsAll(missing))throw new IllegalArgumentException("保留菜品不满足新条件，请先解除保留或调整条件");
                ranked.pool.addAll(retained);
            }
        }
        BalancedRecommendationPolicy policy=new BalancedRecommendationPolicy(metadata);
        BalancedRecommendationPolicy.Selection selected=policy.select(ranked.pool,w,preferences.get(user),ranked.recent,nearbyPlans(user,c),learning==null?Collections.emptyMap():learning.weights(user),command,target,java.util.concurrent.ThreadLocalRandom.current());
        List<Dish> details;
        if("replace".equals(command)){
            Set<Long> retained=prior.getDishes().stream().filter(d->!Objects.equals(d.getId(),target)).map(Dish::getId).collect(Collectors.toSet());
            Map<Long,Dish> replacements=attachQuality(user,selected.dishes.stream().filter(d->!retained.contains(d.getId())).collect(Collectors.toList())).stream().collect(Collectors.toMap(Dish::getId,d->d));
            details=selected.dishes.stream().map(d->replacements.getOrDefault(d.getId(),d)).collect(Collectors.toList());
        }else details=attachQuality(user,selected.dishes);
        PlanDraft next=new PlanDraft();next.setDishes(details);next.setContextFingerprint(MealWorkspaceRules.contextFingerprint(c));next.setRequirementsFingerprint(prior.getRequirementsFingerprint());next.setSource("rules");next.setLockedDishIds(new LinkedHashSet<>(prior.getLockedDishIds()));next.setAdjustedBeforeConfirmation(!prior.getDishes().isEmpty()||prior.isAdjustedBeforeConfirmation());
        attachEvidence(next,c,ranked);next.getRecommendationEvidence().put("policyVersion",BalancedRecommendationPolicy.VERSION);
        // New-policy explanations are derived from the actual draw, never from legacy ranking heuristics.
        next.setExplanations(selected.explanations);
        List<String> codes=new ArrayList<>();for(String reason:selected.explanations){
            if(reason.equals("已搭配符合本餐想吃的菜"))codes.add("CURRENT_WISH_MATCH");
            if(reason.equals("偏好菜本轮已推荐，先为你换些新菜"))codes.add("WISH_CYCLE_EXHAUSTED");
            if(reason.equals("避开了近期已记录的菜"))codes.add("RECENT_ACTUAL_AVOIDED");
            if(reason.equals("新候选不足，搭配了近期吃过的菜"))codes.add("RECENT_ACTUAL_FALLBACK");
            if(reason.equals("按本餐想吃搭配，包含近期吃过的菜"))codes.add("CURRENT_WISH_RECENT");
        }next.getRecommendationEvidence().put("codes",codes);
        next=MealWorkspaceRules.advance(prior,next);next.setCycleAfterSelection(selected.cycle);return next;
    }
    public PlanDraft recommendAssistant(Long user,MealWorkspace w,String command,Long target,RecommendationCriteria targetConstraints){
        if(targetConstraints==null)return generate(user,w,command,target,null);
        if(!"replace".equals(command)||target==null)throw new IllegalArgumentException("单菜限制需要明确替换对象");
        RankedCandidates ranking=rank(user,w.getContext(),SelectionOrigin.AUTOMATIC);
        MealContext extra=json.convertValue(w.getContext(),MealContext.class);extra.setCriteria(targetConstraints);
        Set<Long> allowed=eligible(user,extra).stream().map(Dish::getId).collect(Collectors.toSet());ranking.pool.removeIf(d->!allowed.contains(d.getId()));
        return automatic(user,w,ranking,command,target);
    }
    @org.springframework.transaction.annotation.Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public PlanDraft generate(Long user,MealWorkspace w,String command,Long target,List<Long> selected) {
        // Only the explicit user selection command may choose untagged breakfast recipes.
        return generate(user,w,command,target,selected,"select".equals(command)?SelectionOrigin.USER_SELECTION:SelectionOrigin.AUTOMATIC);
    }
    private PlanDraft generate(Long user,MealWorkspace w,String command,Long target,List<Long> selected,SelectionOrigin origin) {
        MealContext c=MealWorkspaceRules.normalize(w.getContext());PlanDraft prior=w.getDraft();
        if("select".equals(command)&&(selected==null||selected.isEmpty()||selected.size()>10))throw new IllegalArgumentException("请选择 1 至 10 道菜");
        RankedCandidates ranking="select".equals(command)?selected(user,c,origin,selected,prior.getLockedDishIds()):rank(user,c,origin);List<Dish> pool=ranking.pool;Map<Long,Dish> valid=pool.stream().collect(Collectors.toMap(Dish::getId,d->d,(a,b)->a));
        if(!"select".equals(command))return automatic(user,w,ranking,command,target);
        List<Dish> result=new ArrayList<>();
        for(Long lock:prior.getLockedDishIds()) {
            if(!valid.containsKey(lock))throw new IllegalArgumentException("保留菜品不满足新条件，请先解除保留或调整条件");
            result.add(valid.get(lock));
        }
        if("select".equals(command)) {
            if(!MealWorkspaceRules.understandsRequirements(prior,c))throw new IllegalArgumentException("本餐文字限制尚未解释，请先帮我安排或在筛选中明确忌口后清空文字");
            if(selected==null||selected.isEmpty()||selected.size()>10)throw new IllegalArgumentException("请选择 1 至 10 道菜");
            for(Long id:selected) {if(!valid.containsKey(id))throw new IllegalArgumentException("所选菜品不满足条件或不可访问");if(result.stream().noneMatch(d->d.getId().equals(id)))result.add(valid.get(id));}
            if(result.size()>10)throw new IllegalArgumentException("保留项与选菜合计最多 10 道菜");
            if(!fitsTime(result,c))throw new IllegalArgumentException("所选方案无法满足整餐用时");
            // Explicit selections become a manual composition; later people changes only affect portions.
            c.setCompositionMode("manual");Map<String,Integer> counts=new LinkedHashMap<>();for(Dish d:result)counts.put(category(d,c),counts.getOrDefault(category(d,c),0)+1);c.setCounts(counts);
        }
        PlanDraft next=new PlanDraft();next.setDishes(attachQuality(user,result));next.setContextFingerprint(MealWorkspaceRules.contextFingerprint(c));next.setRequirementsFingerprint(prior.getRequirementsFingerprint());
        next.setSource("select".equals(command)?(origin==SelectionOrigin.USER_SELECTION?"manual":"agent"):"rules");next.setAdjustedBeforeConfirmation(!prior.getDishes().isEmpty() || prior.isAdjustedBeforeConfirmation());next.setLockedDishIds(new LinkedHashSet<>(prior.getLockedDishIds()));
        attachEvidence(next,c,ranking);
        if("breakfast".equals(c.getMealType())&&origin==SelectionOrigin.USER_SELECTION)next.setExplanations(Collections.singletonList("本餐由你选菜，请核对早餐适用性"));
        return MealWorkspaceRules.advance(prior,next);
    }
    private void attachEvidence(PlanDraft draft,MealContext context,RankedCandidates ranking){
        RecommendationScorer scorer=new RecommendationScorer();
        draft.setRecommendationEvidence(scorer.evidence(draft.getDishes(),ranking.criteria,context.getOwnedIngredients(),ranking.recent));
        draft.setExplanations(scorer.explanations(draft.getRecommendationEvidence()));
    }
    public PlanDraft lockAndValidate(Long user,MealWorkspace w,List<Long> ids) {
        return lockAndValidate(user,w,ids,false);
    }
    public PlanDraft lockAndValidateAssistant(Long user,MealWorkspace w,List<Long> ids) {
        return lockAndValidate(user,w,ids,true);
    }
    public PlanDraft lockMenuForSave(Long user,MealWorkspace w,List<Long> ids) {
        lockRecipeSnapshots(user,w,ids,false);
        return MealWorkspaceRules.copy(w.getDraft());
    }
    public void lockMenuForUndo(Long user,MealWorkspace w,List<Long> ids){
        lockRecipeSnapshots(user,w,ids,true);
    }
    private PlanDraft lockAndValidate(Long user,MealWorkspace w,List<Long> ids,boolean strictContent) {
        lockRecipeSnapshots(user,w,ids,strictContent);
        // New selections and assistant adjustments still enforce explicit restrictions.
        return validateSelection(user,w,ids,"manual".equals(w.getDraft().getSource())?SelectionOrigin.USER_SELECTION:SelectionOrigin.AUTOMATIC);
    }
    private void lockRecipeSnapshots(Long user,MealWorkspace w,List<Long> ids,boolean strictContent) {
        List<Long> reviewedIds=w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        if(ids.isEmpty()||!reviewedIds.equals(ids)||new HashSet<>(ids).size()!=ids.size())throw new IllegalArgumentException("菜单菜品信息无效");
        // Compare the locking current read; ordinary reads may use an earlier InnoDB snapshot.
        Map<Long,Dish> snapshots=enrich(dishes.lockReadableDishes(ids,user)).stream().collect(Collectors.toMap(Dish::getId,d->d));
        if(!snapshots.keySet().containsAll(ids))throw new MealConsumptionService.VersionConflict("菜品可用状态已变化，请重新安排");
        for(Dish reviewed:w.getDraft().getDishes()) if(!MealWorkspaceRules.sameRecipe(reviewed,snapshots.get(reviewed.getId())))throw new MealConsumptionService.VersionConflict("菜品信息已更新，请查看新方案后确认");
        if(strictContent)for(Dish reviewed:w.getDraft().getDishes())if(!Objects.equals(reviewed.getContentVersion(),snapshots.get(reviewed.getId()).getContentVersion()))throw new MealConsumptionService.VersionConflict("菜品内容版本已更新，请重新预览");
    }
    public PlanDraft validateAgent(Long user,MealWorkspace w,List<Long> ids) {
        return validateSelection(user,w,ids,SelectionOrigin.AUTOMATIC);
    }
    public void validateRestoredDraft(Long user,MealWorkspace w,boolean completeContext) {
        List<Long> ids=w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        if(completeContext){lockAndValidateAssistant(user,w,ids);return;}
        Map<Long,Dish> readable=enrich(dishes.lockReadableDishes(ids,user)).stream().collect(Collectors.toMap(Dish::getId,d->d));
        Set<Long> allowed=selected(user,w.getContext(),"manual".equals(w.getDraft().getSource())?SelectionOrigin.USER_SELECTION:SelectionOrigin.AUTOMATIC,ids,w.getDraft().getLockedDishIds()).pool.stream().map(Dish::getId).collect(Collectors.toSet());
        for(Dish dish:w.getDraft().getDishes())if(!allowed.contains(dish.getId())||!MealWorkspaceRules.sameRecipe(dish,readable.get(dish.getId())))throw new MealConsumptionService.VersionConflict("撤销内容已不可用或不符合当前限制");
    }
    private PlanDraft validateSelection(Long user,MealWorkspace w,List<Long> ids,SelectionOrigin origin) {
        MealWorkspace validation=com.eatwhat.util.DishSnapshotReader.convert(json,w,MealWorkspace.class);
        validation.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));
        PlanDraft validated=generate(user,validation,"select",null,ids,origin);
        Map<String,Integer> actualCounts=new HashMap<>();for(Dish d:validated.getDishes()) {String type=category(d,w.getContext());actualCounts.put(type,actualCounts.getOrDefault(type,0)+1);}
        Map<String,Integer> expected=new HashMap<>(w.getContext().getCounts());expected.values().removeIf(n->n==0);
        if(!expected.equals(actualCounts))throw new IllegalArgumentException("方案菜数与本餐设置不一致，请调整菜数或重新安排");
        validated.setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));return validated;
    }
    private String category(Dish d,MealContext c) {return MealWorkspaceRules.category(d,c);}
    private boolean fitsTime(List<Dish> list,MealContext c) {Integer total=MealWorkspaceRules.totalMinutes(list);return c.getTotalCookMinutes()==null||(total!=null&&total<=c.getTotalCookMinutes());}
}
