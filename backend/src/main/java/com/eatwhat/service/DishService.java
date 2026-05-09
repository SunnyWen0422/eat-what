package com.eatwhat.service;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;

/**
 * 菜品业务逻辑层
 */
@Service
public class DishService {

    @Autowired
    private DishMapper dishMapper;

    /**
     * 获取菜品列表（分页）
     */
    public List<Dish> getDishes(String type, String keyword, int page, int pageSize) {
        if (type != null && !type.isEmpty()) {
            int offset = (page - 1) * pageSize;
            return dishMapper.selectDishesByTypePage(type, pageSize, offset);
        }
        return dishMapper.selectAllDishes();
    }

    /**
     * 获取某类型菜品总数
     */
    public int getDishesCountByType(String type) {
        return dishMapper.countByType(type);
    }

    /**
     * 搜索菜品
     */
    public List<Dish> searchDishes(String keyword, String type) {
        if (type != null && !type.isEmpty()) {
            return dishMapper.searchDishes(keyword, type);
        }
        return dishMapper.searchDishesByKeyword(keyword);
    }

    /**
     * 创建自定义菜品
     */
    public Dish createDish(Dish dish) {
        dish.setIsCustom(1);
        dishMapper.insert(dish);
        return dish;
    }

    /**
     * 根据ID获取菜品
     */
    public Dish getDishById(Long id) {
        return dishMapper.selectById(id);
    }

    /**
     * 批量获取菜品
     */
    public List<Dish> getDishesByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        return dishMapper.selectByIds(ids);
    }

    /**
     * 获取菜品总数
     */
    public int getDishCount() {
        return dishMapper.countAll();
    }

    /**
     * 获取菜品列表（轻量版）
     */
    public List<Dish> getDishesLite(String type, String keyword) {
        if (type != null && !type.isEmpty()) {
            return dishMapper.selectDishesLiteByType(type);
        }
        return dishMapper.selectAllDishesLite();
    }

    /**
     * 生成推荐方案 - 后端直出，减少数据传输
     * 各类型抽取100道作为候选池，三套方案之间菜品不重复
     */
    public List<PlanDTO> generateRecommendPlans(RecommendRequest req) {
        int meatCount = req.getMeat() != null ? req.getMeat() : 2;
        int vegCount = req.getVeg() != null ? req.getVeg() : 2;
        int soupCount = req.getSoup() != null ? req.getSoup() : 1;
        String mealType = req.getMealType() != null ? req.getMealType() : "lunch";

        // 各类型抽取100道作为候选池，提供充足冗余
        final int CANDIDATE_LIMIT = 100;
        List<Dish> meatPool = dishMapper.selectDishesRandomByType("meat", CANDIDATE_LIMIT);
        List<Dish> vegPool = dishMapper.selectDishesRandomByType("veg", CANDIDATE_LIMIT);
        List<Dish> soupPool = dishMapper.selectDishesRandomByType("soup", CANDIDATE_LIMIT);

        List<Dish> userSelected = req.getUserSelectedDishes();

        // 三套方案之间全局去重
        Set<String> usedNamesAcrossAllPlans = new HashSet<>();
        List<PlanDTO> plans = new ArrayList<>();

        for (int i = 0; i < 3; i++) {
            List<Dish> planDishes = new ArrayList<>();
            Set<String> usedNames = new HashSet<>(usedNamesAcrossAllPlans);

            // 先加入用户选中菜品
            if (userSelected != null && !userSelected.isEmpty()) {
                for (Dish d : userSelected) {
                    if (d != null && d.getName() != null && !usedNames.contains(d.getName())) {
                        planDishes.add(d);
                        usedNames.add(d.getName());
                    }
                }
            }

            // 计算各类型还需补充的数量
            int meatNeeded = meatCount;
            int vegNeeded = vegCount;
            int soupNeeded = soupCount;
            for (Dish d : planDishes) {
                String t = d.getType();
                if ("meat".equals(t)) meatNeeded--;
                else if ("veg".equals(t)) vegNeeded--;
                else if ("soup".equals(t)) soupNeeded--;
            }

            // 从候选池补充荤菜
            for (Dish d : meatPool) {
                if (meatNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d);
                    usedNames.add(d.getName());
                    meatNeeded--;
                }
            }
            // 从候选池补充素菜
            for (Dish d : vegPool) {
                if (vegNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d);
                    usedNames.add(d.getName());
                    vegNeeded--;
                }
            }
            // 从候选池补充汤
            for (Dish d : soupPool) {
                if (soupNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d);
                    usedNames.add(d.getName());
                    soupNeeded--;
                }
            }

            if (!planDishes.isEmpty()) {
                plans.add(new PlanDTO(planDishes));
                // 将本方案菜品加入全局已用集合，确保后续方案不重复
                for (Dish d : planDishes) {
                    if (d.getName() != null) {
                        usedNamesAcrossAllPlans.add(d.getName());
                    }
                }
            }
        }

        return plans;
    }

    /**
     * 从全表随机获取一道指定类型的菜（排除已用ID）
     * 用于"换一个"功能，从整体数据中重新推荐
     */
    public Dish getSingleRecommendation(String type, List<Long> excludeIds) {
        if (excludeIds == null) {
            excludeIds = Collections.emptyList();
        }
        return dishMapper.selectDishRandomByTypeExclude(type, excludeIds);
    }
}
