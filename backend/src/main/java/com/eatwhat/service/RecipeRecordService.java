package com.eatwhat.service;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.RecipeRecordMapper;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 菜谱记录业务逻辑层
 */
@Service
public class RecipeRecordService {

    private final RecipeRecordMapper recipeRecordMapper;
    private final DishQueryService dishQueryService;

    public RecipeRecordService(RecipeRecordMapper recipeRecordMapper, DishQueryService dishQueryService) {
        this.recipeRecordMapper = recipeRecordMapper;
        this.dishQueryService = dishQueryService;
    }

    /**
     * 保存菜谱记录
     */
    public RecipeRecord saveRecipeRecord(RecipeRecord record) {
        record.setCreateTime(new Date());
        record.setUpdateTime(new Date());
        recipeRecordMapper.insert(record);
        return record;
    }

    /**
     * 获取指定日期的菜谱记录，并填充菜品名称
     * @param dateString 日期字符串，格式 "yyyy-MM-dd"
     */
    public List<RecipeRecord> getRecordsByDate(Long userId, String dateString) {
        List<RecipeRecord> records = recipeRecordMapper.selectByUserAndDate(userId, dateString);

        // 收集所有dishIds，批量查询food表获取菜名
        Set<Long> allDishIds = new HashSet<>();
        for (RecipeRecord record : records) {
            List<Long> dishIds = record.getDishIds();
            if (dishIds != null) {
                allDishIds.addAll(dishIds);
            }
        }

        if (!allDishIds.isEmpty()) {
            List<Dish> dishes = dishQueryService.getDishesByIds(new ArrayList<>(allDishIds));
            Map<Long, String> dishNameMap = dishes.stream()
                    .collect(Collectors.toMap(Dish::getId, Dish::getName));

            // 为每条记录填充dishNames
            for (RecipeRecord record : records) {
                List<Long> dishIds = record.getDishIds();
                if (dishIds != null && !dishIds.isEmpty()) {
                    StringBuilder names = new StringBuilder();
                    for (Long dishId : dishIds) {
                        String name = dishNameMap.get(dishId);
                        if (name != null) {
                            if (names.length() > 0) {
                                names.append(",");
                            }
                            names.append(name);
                        }
                    }
                    record.setDishNames(names.toString());
                }
            }
        }

        return records;
    }

    /**
     * 获取日期范围内的记录日期
     */
    public List<Date> getRecordDatesInRange(Long userId, Date startDate, Date endDate) {
        return recipeRecordMapper.selectRecordDatesByUserAndRange(userId, startDate, endDate);
    }

    public Set<Long> getRecentDishIds(Long userId, int days) {
        if (userId == null || days <= 0) return Collections.emptySet();
        Calendar calendar = Calendar.getInstance();
        calendar.add(Calendar.DAY_OF_YEAR, -Math.min(30, days));
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        List<RecipeRecord> records = recipeRecordMapper.selectRecordsByUserAndRange(userId, calendar.getTime(), new Date());
        Set<Long> ids = new HashSet<>();
        for (RecipeRecord record : records) {
            if (record.getDishIds() != null) ids.addAll(record.getDishIds());
        }
        return ids;
    }

    /**
     * 更新菜谱记录
     */
    public boolean updateRecipeRecord(RecipeRecord record) {
        record.setUpdateTime(new Date());
        return recipeRecordMapper.update(record) > 0;
    }

    /**
     * 删除菜谱记录
     */
    public boolean deleteRecipeRecord(Long id, Long userId) {
        return recipeRecordMapper.delete(id, userId) > 0;
    }

    /**
     * 删除指定日期和餐次的记录
     * @param dateString 日期字符串，格式 "yyyy-MM-dd"
     */
    public boolean deleteRecordByDateAndMeal(Long userId, String dateString, String mealType) {
        return recipeRecordMapper.deleteByDateAndMeal(userId, dateString, mealType) > 0;
    }

    /**
     * 获取饮食统计数据
     */
    public StatisticsDTO getStatistics(Long userId, Date startDate, Date endDate) {
        // 查询日期范围内的所有记录
        List<RecipeRecord> records = recipeRecordMapper.selectRecordsByUserAndRange(userId, startDate, endDate);

        // 统计有记录的日期数
        Set<String> recordDates = new HashSet<>();
        for (RecipeRecord record : records) {
            if (record.getRecordDate() != null) {
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd");
                recordDates.add(sdf.format(record.getRecordDate()));
            }
        }

        // 收集所有菜品ID
        Set<Long> allDishIds = new HashSet<>();
        for (RecipeRecord record : records) {
            List<Long> dishIds = record.getDishIds();
            if (dishIds != null) {
                allDishIds.addAll(dishIds);
            }
        }

        // 批量获取菜品信息
        List<Dish> dishes = dishQueryService.getDishesByIds(new ArrayList<>(allDishIds));
        Map<Long, Dish> dishMap = dishes.stream()
                .collect(Collectors.toMap(Dish::getId, dish -> dish));

        // 统计各类别数量
        int meatCount = 0;
        int vegCount = 0;
        int soupCount = 0;

        for (RecipeRecord record : records) {
            List<Long> dishIds = record.getDishIds();
            if (dishIds != null) {
                for (Long dishId : dishIds) {
                    Dish dish = dishMap.get(dishId);
                    if (dish != null && dish.getType() != null) {
                        String type = dish.getType();
                        // 类型映射：数据库中文 → 统计用
                        if (type.equals("荤菜") || type.equals("meat")) {
                            meatCount++;
                        } else if (type.equals("素菜") || type.equals("veg")) {
                            vegCount++;
                        } else if (type.equals("汤") || type.equals("汤品") || type.equals("soup")) {
                            soupCount++;
                        }
                    }
                }
            }
        }

        // 构建统计结果
        StatisticsDTO dto = new StatisticsDTO();
        StatisticsDTO.StatisticsData stats = new StatisticsDTO.StatisticsData();
        stats.setMeatCount(meatCount);
        stats.setVegCount(vegCount);
        stats.setSoupCount(soupCount);
        stats.setTotalCalories(0);  // 热量由前端计算

        dto.setStatistics(stats);
        dto.setDaysWithRecords(recordDates.size());
        dto.setDishes(dishes);

        return dto;
    }
}
