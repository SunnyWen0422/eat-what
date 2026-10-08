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
    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}
    private Dish enrich(Dish dish){return quality==null?dish:quality.enrich(dish);}
    private List<Dish> enrich(List<Dish> dishes){return quality==null?dishes:quality.enrich(dishes);}
    private final DishCandidateQueryService candidates;
    private final DishMapper dishes;
    private final UserPreferenceService preferences;
    private final RecommendationMetadataService metadata;
    private final FavoriteDishService favorites;
    private final MealConsumptionMapper actual;
    private final ObjectMapper json;
    public MealWorkspacePlanner(DishCandidateQueryService candidates,DishMapper dishes,UserPreferenceService preferences,RecommendationMetadataService metadata,
                                FavoriteDishService favorites,MealConsumptionMapper actual,ObjectMapper json) {
        this.candidates=candidates;this.dishes=dishes;this.preferences=preferences;this.metadata=metadata;
        this.favorites=favorites;this.actual=actual;this.json=json;
    }
    public List<Dish> eligible(Long user,MealContext c) {
        if(!metadata.validateCriteria(c.getCriteria()).isEmpty())throw new IllegalArgumentException("本餐条件包含无效的标签或用时，请在设置中核对");
        EffectiveRecommendationCriteria criteria=new RecommendationCriteriaResolver().resolve(c.getCriteria(),preferences.get(user),true);
        List<Dish> pool=new ArrayList<>(candidates.findForUser(user,null,null,criteria,10000));
        if ("breakfast".equals(c.getMealType())) pool=pool.stream().filter(d->Arrays.asList((d.getTagCodes()==null?"":d.getTagCodes()).split(",")).contains("BREAKFAST_ELIGIBLE")).collect(Collectors.toList());
        Collections.shuffle(pool);
        final EffectiveRecommendationCriteria effective=criteria;
        Set<Long> favoriteIds=new HashSet<>(favorites.getFavoriteDishIds(user));
        Set<Long> recentIds=recentDishIds(user,c,criteria.getAvoidRecentDays());
        RecommendationScorer scorer=new RecommendationScorer();
        pool.sort(Comparator.comparingInt((Dish d)->scorer.score(d,effective,favoriteIds,recentIds)+ownedScore(d,c)).reversed());
        return pool;
    }
    private Set<Long> recentDishIds(Long user,MealContext context,Integer days) {
        if (days == null || days <= 0) return Collections.emptySet();
        java.time.LocalDate end=MealConsumptionService.date(context.getDate());
        java.time.LocalDate start=end.minusDays(Math.min(30,days)-1);
        Set<Long> ids=new HashSet<>();
        for (MealConsumption meal:actual.range(user,start.toString(),end.toString())) {
            if (!"eaten".equals(meal.getStatus())) continue;
            try {
                List<Map<String,Object>> entries=json.readValue(meal.getActualDishesJson(),new TypeReference<List<Map<String,Object>>>(){});
                for (Map<String,Object> entry:entries) {
                    Object id=entry.get("dishId");
                    if (id != null && String.valueOf(id).matches("[1-9][0-9]*")) ids.add(Long.valueOf(String.valueOf(id)));
                }
            } catch (Exception error) { throw new IllegalStateException("近期实际用餐快照无法读取",error); }
        }
        return ids;
    }
    private int ownedScore(Dish d,MealContext c) {
        int score=0;String ingredients=String.valueOf(d.getCl())+String.valueOf(d.getIngredientsAmounts());
        for(String ingredient:c.getOwnedIngredients()) if(!ingredient.trim().isEmpty()&&ingredients.contains(ingredient.trim())) score+=5;
        return score;
    }
    public PlanDraft generate(Long user,MealWorkspace w,String command,Long target,List<Long> selected) {
        MealContext c=MealWorkspaceRules.normalize(w.getContext());PlanDraft prior=w.getDraft();
        List<Dish> pool=eligible(user,c);Map<Long,Dish> valid=pool.stream().collect(Collectors.toMap(Dish::getId,d->d,(a,b)->a));
        if ("replace".equals(command)) {
            Dish old=prior.getDishes().stream().filter(d->Objects.equals(d.getId(),target)).findFirst().orElseThrow(()->new IllegalArgumentException("菜品不在方案中"));
            Set<Long> used=prior.getDishes().stream().map(Dish::getId).collect(Collectors.toSet());
            Dish replacement=pool.stream().filter(d->!used.contains(d.getId())&&category(d,c).equals(category(old,c))).filter(d->{List<Dish> next=new ArrayList<>(prior.getDishes());next.removeIf(v->Objects.equals(v.getId(),target));next.add(d);return fitsTime(next,c);}).findFirst().orElse(null);
            if(!MealWorkspaceRules.matchesContext(prior,c))throw new IllegalArgumentException("条件已变化，请重新安排整餐");
            return MealWorkspaceRules.command(prior,command,target,replacement);
        }
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
        } else {
            Set<Long> previous=prior.getDishes().stream().map(Dish::getId).collect(Collectors.toSet());
            pool.sort(Comparator.comparing(d->previous.contains(d.getId())));
            for(Map.Entry<String,Integer> count:c.getCounts().entrySet()) {
                long have=result.stream().filter(d->category(d,c).equals(count.getKey())).count();
                if(have>count.getValue())throw new IllegalArgumentException("菜数少于保留菜品，请调整条件");
                while(have<count.getValue()) {
                    Dish pick=pool.stream().filter(d->category(d,c).equals(count.getKey())).filter(d->result.stream().noneMatch(v->v.getId().equals(d.getId())||Objects.equals(v.getName(),d.getName()))).filter(d->{List<Dish> next=new ArrayList<>(result);next.add(d);return fitsTime(next,c);}).findFirst().orElse(null);
                    if(pick==null)throw new IllegalArgumentException("没有足够菜品满足本餐条件，原方案已保留");
                    result.add(pick);have++;
                }
            }
            if(result.stream().anyMatch(d->!c.getCounts().containsKey(category(d,c))))throw new IllegalArgumentException("模板未包含保留菜品类型");
        }
        PlanDraft next=new PlanDraft();next.setDishes(result);next.setContextFingerprint(MealWorkspaceRules.contextFingerprint(c));next.setRequirementsFingerprint(prior.getRequirementsFingerprint());
        next.setSource("select".equals(command)?"manual":"rules");next.setAdjustedBeforeConfirmation(!prior.getDishes().isEmpty() || prior.isAdjustedBeforeConfirmation());next.setLockedDishIds(new LinkedHashSet<>(prior.getLockedDishIds()));
        next.setExplanations(Arrays.asList("按本餐人数和菜数搭配","已校验明确排除条件", "breakfast".equals(c.getMealType())?"仅使用早餐适用候选":"采购前核对份量，有可信依据的材料才按人数换算"));
        return MealWorkspaceRules.advance(prior,next);
    }
    public PlanDraft lockAndValidate(Long user,MealWorkspace w,List<Long> ids) {
        // Compare the locking current read; ordinary reads may use an earlier InnoDB snapshot.
        Map<Long,Dish> snapshots=enrich(dishes.lockReadableDishes(ids,user)).stream().collect(Collectors.toMap(Dish::getId,d->d));
        if(!snapshots.keySet().containsAll(ids))throw new MealConsumptionService.VersionConflict("菜品可用状态已变化，请重新安排");
        for(Dish reviewed:w.getDraft().getDishes()) if(!MealWorkspaceRules.sameRecipe(reviewed,snapshots.get(reviewed.getId())))throw new MealConsumptionService.VersionConflict("菜品信息已更新，请查看新方案后确认");
        return validateAgent(user,w,ids);
    }
    public PlanDraft validateAgent(Long user,MealWorkspace w,List<Long> ids) {
        MealWorkspace validation=new com.fasterxml.jackson.databind.ObjectMapper().convertValue(w,MealWorkspace.class);
        validation.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));
        PlanDraft validated=generate(user,validation,"select",null,ids);
        Map<String,Integer> actualCounts=new HashMap<>();for(Dish d:validated.getDishes()) {String type=category(d,w.getContext());actualCounts.put(type,actualCounts.getOrDefault(type,0)+1);}
        Map<String,Integer> expected=new HashMap<>(w.getContext().getCounts());expected.values().removeIf(n->n==0);
        if(!expected.equals(actualCounts))throw new IllegalArgumentException("方案菜数与本餐设置不一致，请调整菜数或重新安排");
        validated.setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));return validated;
    }
    private String category(Dish d,MealContext c) {return "breakfast".equals(c.getMealType())&&!"staple".equals(d.getType())?"side":d.getType();}
    private boolean fitsTime(List<Dish> list,MealContext c) {Integer total=MealWorkspaceRules.totalMinutes(list);return c.getTotalCookMinutes()==null||(total!=null&&total<=c.getTotalCookMinutes());}
}
