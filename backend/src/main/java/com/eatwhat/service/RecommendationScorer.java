package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.entity.Dish;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.Map;

public class RecommendationScorer {
    static final int CUISINE_WEIGHT = 30;
    static final int TAG_WEIGHT = 12;
    static final int TAG_WEIGHT_CAP = 24;
    static final int FAVORITE_WEIGHT = 10;
    static final int RECENT_WEIGHT = -40;

    public int score(Dish dish,
                     EffectiveRecommendationCriteria criteria,
                     Set<Long> favoriteIds,
                     Set<Long> recentIds) {
        if (dish == null) return Integer.MIN_VALUE;
        EffectiveRecommendationCriteria value = criteria == null ? new EffectiveRecommendationCriteria() : criteria;
        Set<String> tags = tags(dish.getTagCodes());
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
