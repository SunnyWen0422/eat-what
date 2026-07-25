package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.dto.UserPreferenceDTO;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class RecommendationCriteriaResolver {

    public EffectiveRecommendationCriteria resolve(RecommendationCriteria session,
                                                    UserPreferenceDTO saved,
                                                    boolean useSavedPreferences) {
        RecommendationCriteria current = session == null ? new RecommendationCriteria() : session;
        UserPreferenceDTO preferences = saved == null ? new UserPreferenceDTO() : saved;
        EffectiveRecommendationCriteria result = new EffectiveRecommendationCriteria();
        result.setCuisineCodes(normalize(current.getCuisineCodes()));
        result.setIncludeTagCodes(normalize(current.getIncludeTagCodes()));
        result.setExcludeTagCodes(union(preferences.getExcludedTagCodes(), current.getExcludeTagCodes()));
        result.setExcludedIngredients(unionText(preferences.getExcludedIngredients(), current.getExcludedIngredients()));
        result.setMaxCookMinutes(strictest(preferences.getMaxCookMinutes(), current.getMaxCookMinutes()));
        if (useSavedPreferences) {
            result.setPreferredCuisineCodes(normalize(preferences.getPreferredCuisineCodes()));
            result.setPreferredTagCodes(normalize(preferences.getPreferredTagCodes()));
            result.setAvoidRecentDays(preferences.getAvoidRecentDays() == null ? 7 : Math.max(0, Math.min(30, preferences.getAvoidRecentDays())));
        } else {
            result.setPreferredCuisineCodes(new ArrayList<>());
            result.setPreferredTagCodes(new ArrayList<>());
            result.setAvoidRecentDays(0);
        }
        return result;
    }

    private List<String> normalize(Collection<String> values) {
        Set<String> normalized = new TreeSet<>();
        if (values != null) {
            for (String value : values) {
                if (value != null && !value.trim().isEmpty()) normalized.add(value.trim().toUpperCase());
            }
        }
        return new ArrayList<>(normalized);
    }

    private List<String> union(Collection<String> left, Collection<String> right) {
        List<String> all = new ArrayList<>();
        if (left != null) all.addAll(left);
        if (right != null) all.addAll(right);
        return normalize(all);
    }

    private List<String> unionText(Collection<String> left, Collection<String> right) {
        Set<String> normalized = new TreeSet<>();
        if (left != null) left.stream().filter(v -> v != null && !v.trim().isEmpty()).map(String::trim).forEach(normalized::add);
        if (right != null) right.stream().filter(v -> v != null && !v.trim().isEmpty()).map(String::trim).forEach(normalized::add);
        return new ArrayList<>(normalized);
    }

    private Integer strictest(Integer saved, Integer session) {
        if (saved == null || saved <= 0) return session != null && session > 0 ? session : null;
        if (session == null || session <= 0) return saved;
        return Math.min(saved, session);
    }
}
