package com.eatwhat.service;

import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.HashMap;

@Service
public class DishCandidateQueryService {
    private static final int PAGE_SCAN_BATCH = 256;
    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}

    private final DishMapper dishMapper;

    public DishCandidateQueryService(DishMapper dishMapper) {
        this.dishMapper = dishMapper;
    }

    public List<Dish> findForUser(Long userId,
                                  String type,
                                  String keyword,
                                  RecommendationCriteria criteria,
                                  int maxResults) {
        List<Dish> result = findRawForUser(userId, type, keyword, criteria, maxResults);
        if (quality != null && !result.isEmpty()) quality.enrich(result);
        return result;
    }

    /** Filter raw facts before pagination; quality evidence does not decide eligibility. */
    public List<Dish> findRawForUser(Long userId,
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

    /** Exact count with bounded working memory; only the selected page loads recipe bodies.
     * Keep Java exclusion semantics (literal substrings and trimmed case-insensitive tags).
     * The caller provides a read-only snapshot transaction across batches and detail reads.
     */
    public DishPageDTO findRawPageForUser(Long userId, String type, String keyword,
                                          RecommendationCriteria criteria, int page, int pageSize) {
        RecommendationCriteria value = criteria == null ? new RecommendationCriteria() : criteria;
        long offset = ((long) page - 1) * pageSize;
        int total = 0;
        Long beforeId = null;
        List<Long> selected = new ArrayList<>();
        for (;;) {
            List<Dish> batch = dishMapper.selectFilteredCandidateFacts(userId, blankToNull(type), blankToNull(keyword),
                    safe(value.getCuisineCodes()), safe(value.getIncludeTagCodes()), value.getMaxCookMinutes(), beforeId, PAGE_SCAN_BATCH);
            if (batch == null || batch.isEmpty()) break;
            for (Dish dish : batch) {
                if (hasExcludedTag(dish, value.getExcludeTagCodes()) || containsExcludedIngredient(dish, value.getExcludedIngredients())) continue;
                if (total >= offset && selected.size() < pageSize) selected.add(dish.getId());
                total = Math.incrementExact(total);
            }
            beforeId = batch.get(batch.size() - 1).getId();
            if (batch.size() < PAGE_SCAN_BATCH) break;
        }
        List<Dish> result = new ArrayList<>();
        if (!selected.isEmpty()) {
            Map<Long,Dish> details = new HashMap<>();
            for (Dish dish : dishMapper.selectFilteredPageDetails(selected, userId)) details.put(dish.getId(), dish);
            for (Long id : selected) {
                Dish dish = details.get(id);
                if (dish == null) throw new IllegalStateException("菜谱目录已变化，请重新读取");
                result.add(dish);
            }
        }
        return new DishPageDTO(result, total, page, pageSize);
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
