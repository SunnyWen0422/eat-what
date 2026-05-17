package com.eatwhat.service;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.CompletableFuture;

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
     * 获取菜品列表（轻量版，支持limit）
     */
    public List<Dish> getDishesLite(String type, String keyword, int limit) {
        if (type != null && !type.isEmpty()) {
            return dishMapper.selectDishesLiteByType(type, limit);
        }
        // 无 type 时返回全量（旧行为兼容）
        return dishMapper.selectAllDishesLite();
    }

    /**
     * 获取菜品列表（轻量版，无limit兼容旧调用）
     */
    public List<Dish> getDishesLite(String type, String keyword) {
        // limit=Integer.MAX_VALUE 表示不限量，兼容旧调用
        return getDishesLite(type, keyword, Integer.MAX_VALUE);
    }

    /**
     * 生成推荐方案 - 后端直出，减少数据传输
     * 四路并行取ID（meat/veg/soup/dessert），应用层随机打乱，一次批量查详情
     */
    public List<PlanDTO> generateRecommendPlans(RecommendRequest req) {
        int meatCount = req.getMeat() != null ? req.getMeat() : 2;
        int vegCount = req.getVeg() != null ? req.getVeg() : 2;
        int soupCount = req.getSoup() != null ? req.getSoup() : 1;
        int dessertCount = req.getDessert() != null ? req.getDessert() : 0;

        final int CANDIDATE_LIMIT = 100;

        // 四路并行取ID（无 ORDER BY RAND()，极快）
        CompletableFuture<List<Long>> meatFuture =
            CompletableFuture.supplyAsync(() -> dishMapper.selectIdsByType("meat"));
        CompletableFuture<List<Long>> vegFuture =
            CompletableFuture.supplyAsync(() -> dishMapper.selectIdsByType("veg"));
        CompletableFuture<List<Long>> soupFuture =
            CompletableFuture.supplyAsync(() -> dishMapper.selectIdsByType("soup"));
        CompletableFuture<List<Long>> dessertFuture =
            CompletableFuture.supplyAsync(() -> dishMapper.selectIdsByType("dessert"));

        CompletableFuture.allOf(meatFuture, vegFuture, soupFuture, dessertFuture).join();

        List<Long> meatIds = meatFuture.join();
        List<Long> vegIds = vegFuture.join();
        List<Long> soupIds = soupFuture.join();
        List<Long> dessertIds = dessertFuture.join();

        // 应用层随机打乱
        Collections.shuffle(meatIds);
        Collections.shuffle(vegIds);
        Collections.shuffle(soupIds);
        Collections.shuffle(dessertIds);

        // 取前100个ID，合并成一批，一次查询拿回所有菜品详情
        List<Long> batchIds = new ArrayList<>();
        batchIds.addAll(meatIds.subList(0, Math.min(CANDIDATE_LIMIT, meatIds.size())));
        batchIds.addAll(vegIds.subList(0, Math.min(CANDIDATE_LIMIT, vegIds.size())));
        batchIds.addAll(soupIds.subList(0, Math.min(CANDIDATE_LIMIT, soupIds.size())));
        batchIds.addAll(dessertIds.subList(0, Math.min(CANDIDATE_LIMIT, dessertIds.size())));

        List<Dish> allCandidates = dishMapper.selectByIds(batchIds);

        // 按类型分组
        Map<String, List<Dish>> pool = new HashMap<>();
        pool.put("meat", new ArrayList<>());
        pool.put("veg", new ArrayList<>());
        pool.put("soup", new ArrayList<>());
        pool.put("dessert", new ArrayList<>());
        for (Dish d : allCandidates) {
            String t = d.getType();
            if (pool.containsKey(t)) {
                pool.get(t).add(d);
            }
        }

        List<Dish> meatPool = pool.get("meat");
        List<Dish> vegPool = pool.get("veg");
        List<Dish> soupPool = pool.get("soup");
        List<Dish> dessertPool = pool.get("dessert");
        List<Dish> userSelected = req.getUserSelectedDishes();

        Set<String> usedNamesAcrossAllPlans = new HashSet<>();
        List<PlanDTO> plans = new ArrayList<>();

        for (int i = 0; i < 3; i++) {
            List<Dish> planDishes = new ArrayList<>();
            Set<String> usedNames = new HashSet<>(usedNamesAcrossAllPlans);

            if (userSelected != null && !userSelected.isEmpty()) {
                for (Dish d : userSelected) {
                    if (d != null && d.getName() != null && !usedNames.contains(d.getName())) {
                        planDishes.add(d);
                        usedNames.add(d.getName());
                    }
                }
            }

            int meatNeeded = meatCount;
            int vegNeeded = vegCount;
            int soupNeeded = soupCount;
            int dessertNeeded = dessertCount;
            for (Dish d : planDishes) {
                String t = d.getType();
                if ("meat".equals(t)) meatNeeded--;
                else if ("veg".equals(t)) vegNeeded--;
                else if ("soup".equals(t)) soupNeeded--;
                else if ("dessert".equals(t)) dessertNeeded--;
            }

            for (Dish d : meatPool) {
                if (meatNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d); usedNames.add(d.getName()); meatNeeded--;
                }
            }
            for (Dish d : vegPool) {
                if (vegNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d); usedNames.add(d.getName()); vegNeeded--;
                }
            }
            for (Dish d : soupPool) {
                if (soupNeeded <= 0) break;
                if (d.getName() != null && !usedNames.contains(d.getName())) {
                    planDishes.add(d); usedNames.add(d.getName()); soupNeeded--;
                }
            }
            if (dessertCount > 0 && dessertPool != null) {
                for (Dish d : dessertPool) {
                    if (dessertNeeded <= 0) break;
                    if (d.getName() != null && !usedNames.contains(d.getName())) {
                        planDishes.add(d); usedNames.add(d.getName()); dessertNeeded--;
                    }
                }
            }

            if (!planDishes.isEmpty()) {
                plans.add(new PlanDTO(planDishes));
                for (Dish d : planDishes) {
                    if (d.getName() != null) usedNamesAcrossAllPlans.add(d.getName());
                }
            }
        }

        return plans;
    }

    /**
     * 从全表随机获取一道指定类型的菜（排除已用ID），用于"换一个"功能
     * 无 ORDER BY RAND() — 取全部ID后在应用层随机选取
     */
    public Dish getSingleRecommendation(String type, List<Long> excludeIds) {
        if (excludeIds == null) excludeIds = Collections.emptyList();

        List<Long> ids = dishMapper.selectIdsByTypeExclude(type, excludeIds);
        if (ids == null || ids.isEmpty()) return null;

        int randIndex = (int) (Math.random() * ids.size());
        return dishMapper.selectById(ids.get(randIndex));
    }
}
