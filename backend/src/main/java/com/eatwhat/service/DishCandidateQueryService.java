package com.eatwhat.service;

import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class DishCandidateQueryService {

    private final DishMapper dishMapper;

    public DishCandidateQueryService(DishMapper dishMapper) {
        this.dishMapper = dishMapper;
    }

    public List<Dish> findForUser(Long userId,
                                  String type,
                                  String keyword,
                                  RecommendationCriteria criteria,
                                  int maxResults) {
        RecommendationCriteria value = criteria == null ? new RecommendationCriteria() : criteria;
        List<Dish> source = dishMapper.selectFilteredCandidates(
                userId,
                blankToNull(type),
                blankToNull(keyword),
                safe(value.getCuisineCodes()),
                safe(value.getIncludeTagCodes()),
                value.getMaxCookMinutes());
        if (source == null || source.isEmpty()) return Collections.emptyList();

        int limit = Math.max(1, maxResults);
        List<Dish> result = new ArrayList<>();
        for (Dish dish : source) {
            if (dish == null || hasExcludedTag(dish, value.getExcludeTagCodes())
                    || containsExcludedIngredient(dish, value.getExcludedIngredients())) continue;
            result.add(dish);
            if (result.size() >= limit) break;
        }
        return result;
    }

    private boolean hasExcludedTag(Dish dish, List<String> exclusions) {
        if (exclusions == null || exclusions.isEmpty()) return false;
        Set<String> tags = splitCodes(dish.getTagCodes());
        for (String code : exclusions) {
            if (code != null && tags.contains(code.trim().toUpperCase())) return true;
        }
        return false;
    }

    private boolean containsExcludedIngredient(Dish dish, List<String> exclusions) {
        if (exclusions == null || exclusions.isEmpty()) return false;
        String searchable = ((dish.getCl() == null ? "" : dish.getCl()) + " "
                + (dish.getIngredientsAmounts() == null ? "" : dish.getIngredientsAmounts())).toLowerCase();
        for (String excluded : exclusions) {
            if (excluded != null && !excluded.trim().isEmpty()
                    && searchable.contains(excluded.trim().toLowerCase())) return true;
        }
        return false;
    }

    private Set<String> splitCodes(String value) {
        Set<String> result = new HashSet<>();
        if (value == null) return result;
        for (String item : value.split(",")) {
            if (!item.trim().isEmpty()) result.add(item.trim().toUpperCase());
        }
        return result;
    }

    private List<String> safe(List<String> values) {
        return values == null ? Collections.<String>emptyList() : values;
    }

    private String blankToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
