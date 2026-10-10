package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
public class DishQueryService {
    public static final int MAX_LITE_LIMIT = 1000;
    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}
    private Dish enrich(Dish dish){return quality==null?dish:quality.enrich(dish);}
    private List<Dish> enrich(List<Dish> dishes){return quality==null?dishes:quality.enrich(dishes);}

    private final DishMapper dishMapper;
    private final DishCandidateQueryService candidateQueryService;

    public DishQueryService(DishMapper dishMapper) {
        this(dishMapper, new DishCandidateQueryService(dishMapper));
    }

    @Autowired
    public DishQueryService(DishMapper dishMapper, DishCandidateQueryService candidateQueryService) {
        this.dishMapper = dishMapper;
        this.candidateQueryService = candidateQueryService;
    }

    public DishPageDTO getFilteredDishes(Long userId,
                                         String type,
                                         String keyword,
                                         RecommendationCriteria criteria,
                                         int page,
                                         int pageSize) {
        int safePage = Math.max(1, page);
        int safePageSize = Math.max(1, Math.min(100, pageSize));
        int cap = Integer.MAX_VALUE;
        List<Dish> all = candidateQueryService.findRawForUser(userId, type, keyword, criteria, cap);
        int from = (int)Math.min(all.size(), ((long)safePage - 1) * safePageSize);
        int to = Math.min(all.size(), from + safePageSize);
        List<Dish> returned = new java.util.ArrayList<>(all.subList(from, to));
        return new DishPageDTO(enrich(returned), all.size(), safePage, safePageSize);
    }

    public List<Dish> getDishes(String type, String keyword, int page, int pageSize) {
        if (keyword != null && !keyword.trim().isEmpty()) {
            return searchDishes(keyword.trim(), type);
        }
        if (type != null && !type.isEmpty()) {
            int offset = Math.max(0, page - 1) * pageSize;
            return enrich(dishMapper.selectDishesByTypePage(type, pageSize, offset));
        }
        return enrich(dishMapper.selectAllDishes());
    }

    public int getDishesCountByType(String type) {
        return dishMapper.countByType(type);
    }

    public List<Dish> searchDishes(String keyword, String type) {
        if (type != null && !type.isEmpty()) {
            return enrich(dishMapper.searchDishes(keyword, type));
        }
        return enrich(dishMapper.searchDishesByKeyword(keyword));
    }

    public Dish getDishById(Long id) {
        return enrich(dishMapper.selectById(id));
    }

    public Dish getDishById(Long id, Long userId) {
        return enrich(dishMapper.selectByIdForUser(id, userId));
    }

    public List<Dish> getDishesByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        return enrich(dishMapper.selectByIds(ids));
    }

    public List<Dish> getDishesByIdsForUser(List<Long> ids, Long userId) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        return enrich(dishMapper.selectByIdsForUser(ids, userId));
    }

    public int getDishCount() {
        return dishMapper.countAll();
    }

    public List<Dish> getDishesLite(String type, String keyword, int limit) {
        int safeLimit = Math.max(1, Math.min(MAX_LITE_LIMIT, limit));
        String safeType = type == null || type.trim().isEmpty() ? null : type.trim();
        String safeKeyword = keyword == null || keyword.trim().isEmpty() ? null : keyword.trim();
        return dishMapper.selectDishesLite(safeType, safeKeyword, safeLimit);
    }
}
