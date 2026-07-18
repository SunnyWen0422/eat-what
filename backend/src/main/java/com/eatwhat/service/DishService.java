package com.eatwhat.service;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Service
public class DishService {

    private static final int CANDIDATE_LIMIT = 100;
    private static final String[] RECOMMEND_TYPES = {"meat", "veg", "soup", "dessert", "staple"};

    @Autowired
    private DishMapper dishMapper;

    public List<Dish> getDishes(String type, String keyword, int page, int pageSize) {
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

    public Dish createDish(Dish dish) {
        dish.setIsCustom(1);
        dishMapper.insert(dish);
        return dish;
    }

    public Dish getDishById(Long id) {
        return dishMapper.selectById(id);
    }

    public List<Dish> getCustomDishes(Long userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        return dishMapper.selectCustomByUser(userId);
    }

    public boolean removeCustomDish(Long userId, Long dishId) {
        if (userId == null || dishId == null) {
            return false;
        }
        return dishMapper.clearCustomDishOwner(userId, dishId) > 0;
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

    public List<Dish> getDishesLite(String type, String keyword) {
        return getDishesLite(type, keyword, Integer.MAX_VALUE);
    }

    public List<PlanDTO> generateRecommendPlans(RecommendRequest req) {
        Map<String, Integer> counts = new HashMap<>();
        counts.put("meat", valueOrDefault(req.getMeat(), 2));
        counts.put("veg", valueOrDefault(req.getVeg(), 2));
        counts.put("soup", valueOrDefault(req.getSoup(), 1));
        counts.put("dessert", valueOrDefault(req.getDessert(), 0));
        counts.put("staple", valueOrDefault(req.getStaple(), 0));

        List<Long> batchIds = loadCandidateIds();
        if (batchIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<Dish> allCandidates = dishMapper.selectByIds(batchIds);
        Map<String, List<Dish>> pool = splitByType(allCandidates);
        List<Dish> userSelected = req.getUserSelectedDishes();

        Set<String> usedNamesAcrossAllPlans = new HashSet<>();
        List<PlanDTO> plans = new ArrayList<>();

        for (int i = 0; i < 3; i++) {
            List<Dish> planDishes = new ArrayList<>();
            Set<String> usedNames = new HashSet<>(usedNamesAcrossAllPlans);

            if (userSelected != null) {
                for (Dish dish : userSelected) {
                    addDishIfUnused(planDishes, usedNames, dish);
                }
            }

            Map<String, Integer> remaining = new HashMap<>(counts);
            for (Dish dish : planDishes) {
                String type = dish.getType();
                if (remaining.containsKey(type)) {
                    remaining.put(type, remaining.get(type) - 1);
                }
            }

            for (String type : RECOMMEND_TYPES) {
                fillPlanFromPool(planDishes, usedNames, pool.get(type), remaining.get(type));
            }

            if (!planDishes.isEmpty()) {
                plans.add(new PlanDTO(planDishes));
                for (Dish dish : planDishes) {
                    if (dish.getName() != null) {
                        usedNamesAcrossAllPlans.add(dish.getName());
                    }
                }
            }
        }

        return plans;
    }

    public Dish getSingleRecommendation(String type, List<Long> excludeIds) {
        if (excludeIds == null) {
            excludeIds = Collections.emptyList();
        }

        List<Long> ids = dishMapper.selectIdsByTypeExclude(type, excludeIds);
        if (ids == null || ids.isEmpty()) {
            return null;
        }

        int randIndex = (int) (Math.random() * ids.size());
        return dishMapper.selectById(ids.get(randIndex));
    }

    private List<Long> loadCandidateIds() {
        List<CompletableFuture<List<Long>>> futures = new ArrayList<>();
        for (String type : RECOMMEND_TYPES) {
            futures.add(CompletableFuture.supplyAsync(() -> dishMapper.selectIdsByType(type)));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        List<Long> batchIds = new ArrayList<>();
        for (CompletableFuture<List<Long>> future : futures) {
            List<Long> ids = future.join();
            if (ids == null || ids.isEmpty()) {
                continue;
            }
            Collections.shuffle(ids);
            batchIds.addAll(ids.subList(0, Math.min(CANDIDATE_LIMIT, ids.size())));
        }
        return batchIds;
    }

    private Map<String, List<Dish>> splitByType(List<Dish> dishes) {
        Map<String, List<Dish>> pool = new HashMap<>();
        for (String type : RECOMMEND_TYPES) {
            pool.put(type, new ArrayList<>());
        }
        if (dishes == null) {
            return pool;
        }
        for (Dish dish : dishes) {
            if (dish != null && pool.containsKey(dish.getType())) {
                pool.get(dish.getType()).add(dish);
            }
        }
        return pool;
    }

    private void fillPlanFromPool(List<Dish> planDishes, Set<String> usedNames, List<Dish> pool, Integer need) {
        int remaining = valueOrDefault(need, 0);
        if (remaining <= 0 || pool == null) {
            return;
        }
        for (Dish dish : pool) {
            if (remaining <= 0) {
                break;
            }
            if (addDishIfUnused(planDishes, usedNames, dish)) {
                remaining--;
            }
        }
    }

    private boolean addDishIfUnused(List<Dish> planDishes, Set<String> usedNames, Dish dish) {
        if (dish == null || dish.getName() == null || !usedNames.add(dish.getName())) {
            return false;
        }
        planDishes.add(dish);
        return true;
    }

    private int valueOrDefault(Integer value, int defaultValue) {
        return value == null ? defaultValue : value;
    }
}
