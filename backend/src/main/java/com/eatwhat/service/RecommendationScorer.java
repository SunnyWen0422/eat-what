package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.entity.Dish;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.Map;
import java.util.*;

public class RecommendationScorer {
    static final int CUISINE_WEIGHT = 30;
    static final int TAG_WEIGHT = 12;
    static final int TAG_WEIGHT_CAP = 24;
    static final int FAVORITE_WEIGHT = 0;
    static final int RECENT_WEIGHT = -40;

    public int score(Dish dish,
                     EffectiveRecommendationCriteria criteria,
                     Set<Long> favoriteIds,
                     Set<Long> recentIds) {
        if (dish == null) return Integer.MIN_VALUE;
        EffectiveRecommendationCriteria value = criteria == null ? new EffectiveRecommendationCriteria() : criteria;
        Set<String> tags = value.getPreferredTagCodes().isEmpty()?Collections.emptySet():tags(dish.getTagCodes());
        int score = 0;
        if (dish.getCuisineCode() != null && value.getPreferredCuisineCodes().contains(dish.getCuisineCode())) {
            score += CUISINE_WEIGHT;
        }
        int tagScore = 0;
        for (String preferred : value.getPreferredTagCodes()) {
            if (tags.contains(preferred)) tagScore += TAG_WEIGHT;
        }
        score += Math.min(TAG_WEIGHT_CAP, tagScore);
        if (dish.getId() != null && (favoriteIds == null ? Collections.<Long>emptySet() : favoriteIds).contains(dish.getId())) {
            score += FAVORITE_WEIGHT;
        }
        if (dish.getId() != null && (recentIds == null ? Collections.<Long>emptySet() : recentIds).contains(dish.getId())) {
            score += RECENT_WEIGHT;
        }
        return score;
    }
    public int ownedIngredientScore(Dish dish,List<String> owned){
        if(owned==null||owned.isEmpty())return 0;
        Set<String> names=new HashSet<>();
        String raw=dish.getIngredientsAmounts();if(raw==null||raw.trim().isEmpty())raw=dish.getCl();
        if(raw!=null)for(String line:raw.split("###|#|\\n|、|,"))names.add(line.split("\\|",2)[0].trim());
        int count=0;for(String name:owned)if(name!=null&&names.contains(name.trim()))count++;
        return count*5;
    }
    public Map<String,Object> evidence(List<Dish> selected,EffectiveRecommendationCriteria criteria,List<String> owned,Set<Long> recent){
        Set<String> codes=new LinkedHashSet<>(),unknown=new LinkedHashSet<>();
        if(selected.stream().anyMatch(d->ownedIngredientScore(d,owned)>0))codes.add("OWNED_INGREDIENT_MATCH");
        if(selected.stream().anyMatch(d->criteria.getPreferredCuisineCodes().contains(d.getCuisineCode())||tags(d.getTagCodes()).stream().anyMatch(criteria.getPreferredTagCodes()::contains)))codes.add("EXPLICIT_PREFERENCE_MATCH");
        if(criteria.getAvoidRecentDays()!=null&&criteria.getAvoidRecentDays()>0&&!recent.isEmpty()&&!selected.isEmpty()&&selected.stream().noneMatch(d->recent.contains(d.getId())))codes.add("RECENT_ACTUAL_AVOIDED");
        boolean timeKnown=!selected.isEmpty()&&selected.stream().allMatch(d->d.getCookMinutes()!=null&&d.getCookMinutes()>0&&d.getQuality()!=null&&Arrays.asList("VERIFIED","ESTIMATED").contains(d.getQuality().getTimeStatus()));
        if(!timeKnown)unknown.add("cookMinutes");
        if(timeKnown&&criteria.getMaxCookMinutes()!=null&&selected.stream().allMatch(d->d.getCookMinutes()<=criteria.getMaxCookMinutes()))codes.add("KNOWN_TIME_MATCH");
        Map<String,Object> result=new LinkedHashMap<>();result.put("codes",new ArrayList<>(codes));
        List<String> versions=new ArrayList<>();for(Dish dish:selected)versions.add(dish.getContentVersion());
        result.put("sourceVersion",com.eatwhat.util.WorkflowRequestHash.sha256(String.join("|",versions)));
        result.put("unknownFields",new ArrayList<>(unknown));return result;
    }
    public List<String> explanations(Map<String,Object> evidence){
        Map<String,String> labels=new LinkedHashMap<>();labels.put("OWNED_INGREDIENT_MATCH","包含你填写的已有食材");labels.put("EXPLICIT_PREFERENCE_MATCH","符合已保存的口味偏好");
        labels.put("RECENT_ACTUAL_AVOIDED","避开了近期已记录的菜");labels.put("KNOWN_TIME_MATCH","符合已选单菜用时上限");
        List<String> result=new ArrayList<>();for(Object code:(List<?>)evidence.get("codes"))if(labels.containsKey(code)&&result.size()<2)result.add(labels.get(code));return result;
    }

    /** Explicit actual snapshot identities only; never resolve arbitrary food names. */
    public Set<Long> recentActualIds(String status, List<? extends Map<String, ?>> entries) {
        Set<Long> ids = new HashSet<>();
        if (!"eaten".equals(status)) return ids;
        for (Map<String, ?> entry : entries) {
            Object id = entry.get("dishId");
            if (id != null && String.valueOf(id).matches("[1-9][0-9]*")) ids.add(Long.valueOf(String.valueOf(id)));
        }
        return ids;
    }

    private Set<String> tags(String value) {
        Set<String> tags = new HashSet<>();
        if (value == null) return tags;
        for (String tag : value.split(",")) {
            if (!tag.trim().isEmpty()) tags.add(tag.trim().toUpperCase());
        }
        return tags;
    }
}
