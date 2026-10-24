package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import java.util.*;
import java.util.stream.Collectors;

/** Versioned, pure sampling policy. No favorite signal, I/O, or commits. */
public final class BalancedRecommendationPolicy {
    public static final String VERSION="balanced-v1";
    private final RecommendationMetadataService metadata;
    public BalancedRecommendationPolicy(RecommendationMetadataService metadata){this.metadata=metadata;}
    public static boolean enabled(MealContext c){return VERSION.equals(c.getRecommendationPolicy());}
    public static String identity(Dish d){if(d.getRecipe()!=null&&d.getRecipe().hasNonNull("dishGroupId"))return "group:"+d.getRecipe().path("dishGroupId").asText();String name=d.getName();return name==null||name.trim().isEmpty()?"id:"+d.getId():name.replaceAll("[\\s\\u3000]+","").toLowerCase(Locale.ROOT);}
    static Set<String> tags(String value){Set<String> result=new LinkedHashSet<>();if(value!=null)for(String s:value.split(","))if(!s.trim().isEmpty())result.add(s.trim().toUpperCase(Locale.ROOT));return result;}
    private static String code(String value){return value==null?"":value.trim().toUpperCase(Locale.ROOT);}
    public Set<String> features(Dish d){
        Set<String> result=new LinkedHashSet<>();if(d.getCuisineCode()!=null)result.add("cuisine:"+code(d.getCuisineCode()));
        for(String tag:tags(d.getTagCodes())){String group=metadata.groupOf(tag);if(Arrays.asList("flavor","method").contains(group))result.add(group+":"+tag);}
        return result;
    }
    public Set<String> explicitGroups(MealContext c,UserPreferenceDTO saved){
        Set<String> result=new HashSet<>(groups(c.getCriteria()).keySet());result.addAll(groups(c.getRecommendationPreferences()).keySet());result.addAll(savedGroups(saved).keySet());return result;
    }
    private Map<String,Set<String>> groups(RecommendationCriteria prefs){
        Map<String,Set<String>> result=new LinkedHashMap<>();if(prefs==null)return result;
        if(prefs.getCuisineCodes()!=null&&!prefs.getCuisineCodes().isEmpty())result.put("cuisine",prefs.getCuisineCodes().stream().map(BalancedRecommendationPolicy::code).collect(Collectors.toSet()));
        if(prefs.getIncludeTagCodes()!=null)for(String raw:prefs.getIncludeTagCodes()){String code=code(raw);String group=metadata.groupOf(code);if(group!=null)result.computeIfAbsent(group,k->new HashSet<>()).add(code);}
        return result;
    }
    private Map<String,Set<String>> savedGroups(UserPreferenceDTO saved){RecommendationCriteria p=new RecommendationCriteria();p.setCuisineCodes(saved.getPreferredCuisineCodes());p.setIncludeTagCodes(saved.getPreferredTagCodes());return groups(p);}
    public List<String> mergeRequiredTags(List<String> existing,List<String> added){
        for(List<String> values:Arrays.asList(existing,added))for(String value:values)if(metadata.groupOf(code(value))==null)throw new IllegalArgumentException("明确限制包含未知标签，请在本餐设置中核对");
        RecommendationCriteria before=new RecommendationCriteria(),patch=new RecommendationCriteria();before.setIncludeTagCodes(existing);patch.setIncludeTagCodes(added);
        Map<String,Set<String>> combined=groups(before);
        for(Map.Entry<String,Set<String>> e:groups(patch).entrySet()){
            if(combined.containsKey(e.getKey())){Set<String> intersection=new HashSet<>(combined.get(e.getKey()));intersection.retainAll(e.getValue());if(intersection.isEmpty())throw new IllegalArgumentException("同类明确限制冲突，请调整本餐设置");combined.put(e.getKey(),intersection);}else combined.put(e.getKey(),e.getValue());
        }
        return combined.values().stream().flatMap(Set::stream).sorted().collect(Collectors.toList());
    }
    public boolean preservesRequiredTags(List<String> existing,List<String> next){
        RecommendationCriteria before=new RecommendationCriteria(),after=new RecommendationCriteria();before.setIncludeTagCodes(existing);after.setIncludeTagCodes(next);
        Map<String,Set<String>> required=groups(before),updated=groups(after);
        return required.entrySet().stream().allMatch(e->updated.containsKey(e.getKey())&&!updated.get(e.getKey()).isEmpty()&&e.getValue().containsAll(updated.get(e.getKey())));
    }
    private boolean matches(Dish d,String group,Set<String> values){return "cuisine".equals(group)?values.contains(code(d.getCuisineCode())):!Collections.disjoint(values,tags(d.getTagCodes()));}
    private int hits(Dish d,Map<String,Set<String>> wishes){int n=0;for(Map.Entry<String,Set<String>> e:wishes.entrySet())if(matches(d,e.getKey(),e.getValue()))n++;return n;}
    public boolean matchesWish(Dish d,MealContext c){return enabled(c)&&hits(d,groups(c.getRecommendationPreferences()))>0;}
    public boolean matchesRequiredGroups(Dish d,MealContext c){
        if(!enabled(c))return true;
        Map<String,Set<String>> required=groups(c.getCriteria());return hits(d,required)==required.size();
    }
    static Set<String> mainIngredients(Dish d){
        return CanonicalRecommendationFacts.mainNames(d);
    }
    public double weight(Dish d,MealContext c,UserPreferenceDTO saved,List<Dish> chosen,Map<String,Double> learned){
        Map<String,Set<String>> wishes=enabled(c)?groups(c.getRecommendationPreferences()):Collections.emptyMap();Map<String,Set<String>> usual=savedGroups(saved);
        wishes.keySet().forEach(usual::remove);groups(c.getCriteria()).keySet().forEach(usual::remove);boolean responded=chosen.stream().anyMatch(v->matchesWish(v,c));
        double score=100+Math.min(responded?30:120,hits(d,wishes)*(responded?15:60))+Math.min(60,hits(d,usual)*30);
        Set<String> main=mainIngredients(d);int owned=0;for(String ingredient:new HashSet<>(c.getOwnedIngredients()))if(main.contains(ingredient))owned++;score+=Math.min(30,owned*15);
        Integer desired=enabled(c)?c.getRecommendationPreferences().getMaxCookMinutes():null;if(desired==null&&enabled(c))desired=saved.getMaxCookMinutes();
        Double time=null;
        if(desired!=null&&d.getCookMinutes()!=null&&d.getCookMinutes()>0)time=timeScore(d.getCookMinutes(),desired);
        if(enabled(c)&&c.getExpectedTotalCookMinutes()!=null&&d.getCookMinutes()!=null&&d.getCookMinutes()>0){Integer subtotal=MealWorkspaceRules.totalMinutes(chosen);if(chosen.isEmpty())subtotal=0;if(subtotal!=null){double totalScore=timeScore(subtotal+d.getCookMinutes(),c.getExpectedTotalCookMinutes());time=time==null?totalScore:Math.min(time,totalScore);}}
        if(time!=null)score+=time;
        score=Math.max(50,Math.min(300,score));Set<String> explicit=explicitGroups(c,saved);double total=0;int n=0;
        for(String feature:features(d))if(!explicit.contains(feature.split(":",2)[0])&&learned.containsKey(feature)){total+=learned.get(feature);n++;}
        if(n>0)score*=Math.max(.8,Math.min(1.2,total/n));
        boolean sameMain=false,sameMethod=false,sameFlavor=false;
        for(Dish other:chosen){if(!Collections.disjoint(main,mainIngredients(other)))sameMain=true;for(String feature:features(d))if(features(other).contains(feature)){if(feature.startsWith("method:"))sameMethod=true;if(feature.startsWith("flavor:"))sameFlavor=true;}}
        return score*Math.max(.5,(sameMain?.7:1)*(sameMethod?.9:1)*(sameFlavor?.9:1));
    }
    public static final class Selection {
        public final List<Dish> dishes;public final Map<String,Set<String>> cycle;public final List<String> explanations;
        Selection(List<Dish> dishes,Map<String,Set<String>> cycle,List<String> explanations){this.dishes=dishes;this.cycle=cycle;this.explanations=explanations;}
    }
    public Selection select(List<Dish> candidates,MealWorkspace workspace,UserPreferenceDTO saved,Set<Long> recent,Set<Long> planned,Map<String,Double> learned,String command,Long target,Random random){
        MealContext c=workspace.getContext();PlanDraft prior=workspace.getDraft();List<Dish> pool=new ArrayList<>(candidates);pool.sort(Comparator.comparing(Dish::getId));
        Set<String> recentNames=pool.stream().filter(d->recent.contains(d.getId())).map(BalancedRecommendationPolicy::identity).collect(Collectors.toSet());
        Set<String> plannedNames=pool.stream().filter(d->planned.contains(d.getId())).map(BalancedRecommendationPolicy::identity).collect(Collectors.toSet());
        Map<String,Set<String>> cycle=new LinkedHashMap<>();if(workspace.getRecommendationCycle()!=null)workspace.getRecommendationCycle().forEach((k,v)->cycle.put(k,new LinkedHashSet<>(v)));
        // Old workspaces seed the current menu once, without inventing earlier exposure.
        for(Dish d:prior.getDishes())cycle.computeIfAbsent(MealWorkspaceRules.category(d,c),k->new LinkedHashSet<>()).add(identity(d));
        List<Dish> chosen=new ArrayList<>();Map<String,Integer> need=new LinkedHashMap<>(c.getCounts());
        if("replace".equals(command)){
            Dish old=prior.getDishes().stream().filter(d->Objects.equals(d.getId(),target)).findFirst().orElseThrow(()->new IllegalArgumentException("菜品不在方案中"));
            if(prior.getLockedDishIds().contains(target))throw new IllegalArgumentException("请先解除保留");
            chosen.addAll(prior.getDishes().stream().filter(d->!Objects.equals(d.getId(),target)).collect(Collectors.toList()));need.clear();need.put(MealWorkspaceRules.category(old,c),1);
            pool.removeIf(d->identity(d).equals(identity(old)));
        } else for(Long id:prior.getLockedDishIds()){
            Dish keep=pool.stream().filter(d->id.equals(d.getId())).findFirst().orElseThrow(()->new IllegalArgumentException("保留菜品不满足新条件，请先解除保留或调整条件"));
            chosen.add(keep);String type=MealWorkspaceRules.category(keep,c);if(need.getOrDefault(type,0)<1)throw new IllegalArgumentException("菜数少于保留菜品，请调整条件");need.put(type,need.get(type)-1);
        }
        List<String> explanations=new ArrayList<>();
        boolean wishesUsed=pool.stream().anyMatch(d->matchesWish(d,c))&&pool.stream().filter(d->matchesWish(d,c)).allMatch(d->cycle.getOrDefault(MealWorkspaceRules.category(d,c),Collections.emptySet()).contains(identity(d)));
        boolean recentFallback=false,recentWish=false;
        while(need.values().stream().anyMatch(n->n>0)){
            Map<String,List<Dish>> available=new LinkedHashMap<>();
            Map<String,List<Dish>> completionPools=new LinkedHashMap<>();Map<String,Integer> completionNeed=new LinkedHashMap<>();
            for(Map.Entry<String,Integer> slot:need.entrySet())if(slot.getValue()>0){
                String type=slot.getKey();Map<String,Dish> unique=new LinkedHashMap<>();List<Dish> variants=new ArrayList<>();
                // Prefer the quickest equivalent version for feasibility. Names,
                // rather than catalog IDs, remain the rotation unit.
                for(Dish d:pool)if(type.equals(MealWorkspaceRules.category(d,c))&&chosen.stream().noneMatch(v->identity(v).equals(identity(d)))&&fits(chosen,d,c)){variants.add(d);unique.merge(identity(d),d,(a,b)->completionCost(a,c)<=completionCost(b,c)?a:b);}
                List<Dish> all=new ArrayList<>(unique.values());if(all.isEmpty())throw new IllegalArgumentException("没有足够菜品满足本餐条件，原方案已保留");
                Set<String> used=cycle.computeIfAbsent(type,k->new LinkedHashSet<>());List<Dish> fresh=all.stream().filter(d->!used.contains(identity(d))).collect(Collectors.toList());
                if(fresh.isEmpty()){used.clear();for(Dish d:chosen)if(type.equals(MealWorkspaceRules.category(d,c)))used.add(identity(d));fresh=all;}
                Set<String> freshNames=fresh.stream().map(BalancedRecommendationPolicy::identity).collect(Collectors.toSet());available.put(type,variants.stream().filter(d->freshNames.contains(identity(d))).collect(Collectors.toList()));
                List<Dish> sortedFresh=new ArrayList<>(fresh),sortedAll=new ArrayList<>(all);sortedFresh.sort(Comparator.comparingInt(d->completionCost(d,c)));sortedAll.sort(Comparator.comparingInt(d->completionCost(d,c)));
                // Consume every remaining fresh name before this category can
                // roll over, including when one menu straddles two cycles.
                int freshSlots=Math.min(slot.getValue(),fresh.size());completionNeed.put(type+":fresh",freshSlots);completionPools.put(type+":fresh",sortedFresh);
                completionPools.put(type+":all",sortedAll);
                if(freshSlots<slot.getValue()){completionNeed.put(type+":any",slot.getValue()-freshSlots);completionPools.put(type+":any",sortedAll);}
            }
            Set<String> frontier=new HashSet<>();int remainingSlots=need.values().stream().mapToInt(Integer::intValue).sum();
            for(List<Dish> list:completionPools.values())list.stream().limit(remainingSlots+1).map(BalancedRecommendationPolicy::identity).forEach(frontier::add);
            Map<String,Boolean> feasible=new HashMap<>();
            for(Map.Entry<String,List<Dish>> slot:available.entrySet()){
                Map<String,Dish> representatives=new LinkedHashMap<>();
                for(Dish d:slot.getValue()){
                    String key=slot.getKey()+":"+completionCost(d,c)+":"+(frontier.contains(identity(d))?identity(d):"outside-frontier");
                    if(feasible.computeIfAbsent(key,k->canComplete(completionPools,chosen,d,completionNeed,slot.getKey()+":fresh",c)))representatives.merge(identity(d),d,(a,b)->matchesWish(b,c)&&!matchesWish(a,c)?b:a);
                }
                slot.setValue(new ArrayList<>(representatives.values()));
                if(slot.getValue().isEmpty())throw new IllegalArgumentException("本轮新菜无法满足全部条件，请调整条件，原方案已保留");
            }
            String type=available.keySet().iterator().next();List<Dish> choices=available.get(type);
            boolean answeringWish=false;
            if(chosen.stream().noneMatch(d->matchesWish(d,c))){for(Map.Entry<String,List<Dish>> slot:available.entrySet()){List<Dish> matching=slot.getValue().stream().filter(d->matchesWish(d,c)).collect(Collectors.toList());if(!matching.isEmpty()){type=slot.getKey();choices=matching;answeringWish=true;break;}}}
            choices=preferOutside(preferOutside(choices,recentNames),plannedNames);
            Dish pick=draw(choices,c,saved,chosen,learned,random);if(recentNames.contains(identity(pick))){if(answeringWish)recentWish=true;else recentFallback=true;}chosen.add(pick);cycle.get(type).add(identity(pick));need.put(type,need.get(type)-1);
        }
        if(chosen.stream().anyMatch(d->matchesWish(d,c)))explanations.add("已搭配符合本餐想吃的菜");
        else if(wishesUsed)explanations.add("偏好菜本轮已推荐，先为你换些新菜");
        if(!recent.isEmpty()&&chosen.stream().noneMatch(d->recentNames.contains(identity(d))))explanations.add("避开了近期已记录的菜");
        if(recentFallback)explanations.add("新候选不足，搭配了近期吃过的菜");
        else if(recentWish)explanations.add("按本餐想吃搭配，包含近期吃过的菜");
        if("replace".equals(command)){
            Dish replacement=chosen.get(chosen.size()-1);List<Dish> ordered=new ArrayList<>();for(Dish d:prior.getDishes())ordered.add(Objects.equals(d.getId(),target)?replacement:d);chosen.clear();chosen.addAll(ordered);
        }else{List<String> categories=new ArrayList<>(c.getCounts().keySet());chosen.sort(Comparator.comparingInt(d->categories.indexOf(MealWorkspaceRules.category(d,c))));}
        return new Selection(chosen,cycle,explanations);
    }
    private static double timeScore(int minutes,int desired){return minutes<=desired?20:-Math.min(20,20.0*(minutes-desired)/desired);}
    private List<Dish> preferOutside(List<Dish> pool,Set<String> avoided){List<Dish> result=pool.stream().filter(d->!avoided.contains(identity(d))).collect(Collectors.toList());return result.isEmpty()?pool:result;}
    private boolean canComplete(Map<String,List<Dish>> fastest,List<Dish> chosen,Dish pick,Map<String,Integer> need,String pickSlot,MealContext c){
        if(!fits(chosen,pick,c))return false;
        if(canCompleteStrict(fastest,chosen,pick,need,pickSlot,c))return true;
        // Selecting a name in one category can exhaust that same fresh name in
        // another category. Resolve only these overlapping small fresh sets;
        // ordinary catalogs use the bounded matching path above.
        List<Dish> next=new ArrayList<>(chosen);next.add(pick);Set<String> taken=next.stream().map(BalancedRecommendationPolicy::identity).collect(Collectors.toSet());
        Map<String,Integer> remaining=new LinkedHashMap<>();for(Map.Entry<String,Integer> e:need.entrySet()){int count=e.getValue()-(e.getKey().equals(pickSlot)?1:0);if(count>0)remaining.merge(e.getKey().split(":",2)[0],count,Integer::sum);}
        int total=remaining.values().stream().mapToInt(Integer::intValue).sum();if(total==0)return false;
        Map<String,List<Dish>> pools=new LinkedHashMap<>();Map<String,Integer> slots=new LinkedHashMap<>();Set<String> smallFreshNames=new HashSet<>();Map<String,Integer> occurrences=new HashMap<>();
        for(Map.Entry<String,Integer> e:remaining.entrySet()){
            String type=e.getKey();List<Dish> all=fastest.get(type+":all").stream().filter(d->!taken.contains(identity(d))).collect(Collectors.toList());if(all.size()<e.getValue())return false;
            List<Dish> fresh=fastest.get(type+":fresh").stream().filter(d->!taken.contains(identity(d))).collect(Collectors.toList());if(fresh.isEmpty())fresh=all;
            pools.put(type+":all",all);pools.put(type+":fresh",fresh);int freshCount=Math.min(e.getValue(),fresh.size());slots.put(type+":fresh",freshCount);if(freshCount<e.getValue()){slots.put(type+":any",e.getValue()-freshCount);pools.put(type+":any",all);}
            for(Dish d:fresh){occurrences.merge(identity(d),1,Integer::sum);if(fresh.size()<=total)smallFreshNames.add(identity(d));}
        }
        // If the current pick just exhausted an overlapping category, the
        // rebuilt quotas can already be feasible without another shared pick.
        for(String type:remaining.keySet())for(Dish d:pools.get(type+":fresh")){
            if(!fits(next,d,c))continue;
            if(canCompleteStrict(pools,next,d,slots,type+":fresh",c))return true;
            if(smallFreshNames.contains(identity(d))&&occurrences.getOrDefault(identity(d),0)>1&&canComplete(pools,next,d,slots,type+":fresh",c))return true;
        }
        return false;
    }
    private boolean canCompleteStrict(Map<String,List<Dish>> fastest,List<Dish> chosen,Dish pick,Map<String,Integer> need,String pickSlot,MealContext c){
        Set<String> taken=chosen.stream().map(BalancedRecommendationPolicy::identity).collect(Collectors.toSet());taken.add(identity(pick));
        int subtotal=chosen.stream().mapToInt(d->completionCost(d,c)).sum()+completionCost(pick,c),minimum=subtotal;
        List<String> slots=new ArrayList<>();Set<String> cheapestNames=new HashSet<>();boolean collision=false;
        for(Map.Entry<String,Integer> entry:need.entrySet()){
            int count=entry.getValue()-(entry.getKey().equals(pickSlot)?1:0);if(count<=0)continue;
            for(int i=0;i<count;i++)slots.add(entry.getKey());
            Set<String> counted=new HashSet<>(taken);int found=0;for(Dish d:fastest.getOrDefault(entry.getKey(),Collections.emptyList()))if(counted.add(identity(d))){minimum+=completionCost(d,c);if(!cheapestNames.add(identity(d)))collision=true;if(++found==count)break;}
            if(found<count)return false;
        }
        int limit=c.getTotalCookMinutes()==null?Integer.MAX_VALUE:c.getTotalCookMinutes();if(minimum>limit)return false;
        if(!collision)return true;
        // At most ten slots: the cheapest N distinct names per category suffice.
        // A later name can always be exchanged for one of these N not used by
        // the other N-1 slots. Match names globally, including cross-category aliases.
        Map<String,Map<String,Integer>> costs=new LinkedHashMap<>();Set<String> names=new LinkedHashSet<>();
        for(String type:new LinkedHashSet<>(slots)){
            Map<String,Integer> options=new LinkedHashMap<>();for(Dish d:fastest.getOrDefault(type,Collections.emptyList()))if(!taken.contains(identity(d))){options.putIfAbsent(identity(d),completionCost(d,c));if(options.size()==slots.size())break;}
            costs.put(type,options);names.addAll(options.keySet());
        }
        if(names.size()<slots.size())return false;
        List<String> columns=new ArrayList<>(names);int[][] matrix=new int[slots.size()][columns.size()];
        for(int i=0;i<slots.size();i++)for(int j=0;j<columns.size();j++)matrix[i][j]=costs.get(slots.get(i)).getOrDefault(columns.get(j),100000);
        int remaining=minimumAssignment(matrix);return remaining<100000&&subtotal+remaining<=limit;
    }
    private static int completionCost(Dish d,MealContext c){return c.getTotalCookMinutes()==null?0:d.getCookMinutes()==null?481:d.getCookMinutes();}
    /** Rectangular minimum-cost matching; rows <= 10, columns <= 60. */
    private static int minimumAssignment(int[][] costs){
        int rows=costs.length,cols=costs[0].length;int[] u=new int[rows+1],v=new int[cols+1],p=new int[cols+1],way=new int[cols+1];
        for(int i=1;i<=rows;i++){
            p[0]=i;int column=0;int[] min=new int[cols+1];Arrays.fill(min,Integer.MAX_VALUE);boolean[] used=new boolean[cols+1];
            do{used[column]=true;int row=p[column],delta=Integer.MAX_VALUE,next=0;
                for(int j=1;j<=cols;j++)if(!used[j]){int current=costs[row-1][j-1]-u[row]-v[j];if(current<min[j]){min[j]=current;way[j]=column;}if(min[j]<delta){delta=min[j];next=j;}}
                for(int j=0;j<=cols;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;column=next;
            }while(p[column]!=0);
            do{int previous=way[column];p[column]=p[previous];column=previous;}while(column!=0);
        }return -v[0];
    }
    private boolean fits(List<Dish> chosen,Dish d,MealContext c){if(c.getTotalCookMinutes()==null)return true;List<Dish> next=new ArrayList<>(chosen);next.add(d);Integer total=MealWorkspaceRules.totalMinutes(next);return total!=null&&total<=c.getTotalCookMinutes();}
    private Dish draw(List<Dish> choices,MealContext c,UserPreferenceDTO saved,List<Dish> selected,Map<String,Double> learned,Random random){
        if(random.nextDouble()<.25)return choices.get(random.nextInt(choices.size()));double[] weights=new double[choices.size()];double sum=0;for(int i=0;i<choices.size();i++){weights[i]=weight(choices.get(i),c,saved,selected,learned);sum+=weights[i];}double at=random.nextDouble()*sum;
        for(int i=0;i<choices.size();i++){at-=weights[i];if(at<0)return choices.get(i);}return choices.get(choices.size()-1);
    }
}
