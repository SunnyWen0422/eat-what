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
        int cap = type == null || type.trim().isEmpty() ? 2000 : 400;
        List<Dish> all = candidateQueryService.findForUser(userId, type, keyword, criteria, cap);
        int from = Math.min(all.size(), (safePage - 1) * safePageSize);
        int to = Math.min(all.size(), from + safePageSize);
        return new DishPageDTO(new java.util.ArrayList<>(all.subList(from, to)), all.size(), safePage, safePageSize);
    }

    public List<Dish> getDishes(String type, String keyword, int page, int pageSize) {
        if (keyword != null && !keyword.trim().isEmpty()) {
            return searchDishes(keyword.trim(), type);
        }
        if (type != null && !type.isEmpty()) {
            int offset = Math.max(0, page - 1) * pageSize;
            return dishMapper.selectDishesByTypePage(type, pageSize, offset);
        }
        return dishMapper.selectAllDishes();
    }

    public int getDishesCountByType(String type) {
        return dishMapper.countByType(type);
    }

    public List<Dish> searchDishes(String keyword, String type) {
        if (type != null && !type.isEmpty()) {
            return dishMapper.searchDishes(keyword, type);
        }
        return dishMapper.searchDishesByKeyword(keyword);
    }

    public Dish getDishById(Long id) {
        return dishMapper.selectById(id);
    }

    public Dish getDishById(Long id, Long userId) {
        return dishMapper.selectByIdForUser(id, userId);
    }

    public List<Dish> getDishesByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        return dishMapper.selectByIds(ids);
    }

    public int getDishCount() {
        return dishMapper.countAll();
    }

    public List<Dish> getDishesLite(String type, String keyword, int limit) {
        if (type != null && !type.isEmpty()) {
            return dishMapper.selectDishesLiteByType(type, limit);
        }
        return dishMapper.selectAllDishesLite();
    }
}
