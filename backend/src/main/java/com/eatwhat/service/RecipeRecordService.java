package com.eatwhat.service;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.RecipeRecordMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
    @Transactional
    public RecipeRecord saveRecipeRecord(RecipeRecord record) {
        checkPlanVersion(record);
        validatePlan(record);
        record.setCreateTime(new Date());
        record.setUpdateTime(new Date());
        recipeRecordMapper.insert(record);
        return record;
    }

    @Transactional
    public RecipeRecord saveWorkspaceRecipeRecord(RecipeRecord record,List<Dish> reviewed) {
        checkPlanVersion(record);validatePlan(record);
        Map<Long,Dish> current=record.getDishDetails().stream().collect(Collectors.toMap(Dish::getId,d->d));
        for(Dish dish:reviewed) if(!MealWorkspaceRules.sameRecipe(dish,current.get(dish.getId())))throw new MealConsumptionService.VersionConflict("菜品配方已变化，请重新安排后确认");
        record.setDishDetails(reviewed);record.setCreateTime(new Date());record.setUpdateTime(new Date());recipeRecordMapper.insert(record);return record;
    }

    /** Save without replacing an existing date/meal entry. */
    @Transactional
    public RecipeRecord saveRecipeRecordIfAbsent(RecipeRecord record) {
        recipeRecordMapper.lockUser(record.getUserId());
        validatePlan(record);
        record.setCreateTime(new Date());
        record.setUpdateTime(new Date());
        RecipeRecord slot = recipeRecordMapper.findSlot(record.getUserId(),record.getRecordDateString(),record.getMealType());
        if (slot != null && !Boolean.TRUE.equals(slot.getIsDeleted())) return null;
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
            List<Dish> dishes = dishQueryService.getDishesByIdsForUser(new ArrayList<>(allDishIds), userId);
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
        return recipeRecordMapper.selectRecordDatesByUserAndRange(userId, dayString(startDate), dayString(endDate));
    }

    public Set<Long> getRecentDishIds(Long userId, int days) {
        if (userId == null || days <= 0) return Collections.emptySet();
        Calendar calendar = Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        calendar.add(Calendar.DAY_OF_YEAR, -Math.min(30, days));
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        List<RecipeRecord> records = recipeRecordMapper.selectRecordsByUserAndRange(userId, dayString(calendar.getTime()), dayString(new Date()));
        Set<Long> ids = new HashSet<>();
        for (RecipeRecord record : records) {
            if (record.getDishIds() != null) ids.addAll(record.getDishIds());
        }
        return ids;
    }

    /**
     * 更新菜谱记录
     */
    @Transactional
    public boolean updateRecipeRecord(RecipeRecord record) {
        recipeRecordMapper.lockUser(record.getUserId());
        RecipeRecord current=recipeRecordMapper.findOwned(record.getId(),record.getUserId());
        if(current==null)return false;
        if(record.getExpectedRevision()!=null&&!record.getExpectedRevision().equals(current.getRevision()))throw new MealConsumptionService.VersionConflict("安排已更新，请重新加载");
        if(record.getRecordDateString()==null)record.setRecordDateString(current.calendarDay());
        validatePlan(record);
        record.setUpdateTime(new Date());
        return recipeRecordMapper.update(record) > 0;
    }

    /**
     * 删除菜谱记录
     */
    @Transactional
    public boolean deleteRecipeRecord(Long id, Long userId) {
        recipeRecordMapper.lockUser(userId);
        return recipeRecordMapper.delete(id, userId) > 0;
    }

    /**
     * 删除指定日期和餐次的记录
     * @param dateString 日期字符串，格式 "yyyy-MM-dd"
     */
    @Transactional
    public boolean deleteRecordByDateAndMeal(Long userId, String dateString, String mealType) {
        recipeRecordMapper.lockUser(userId);
        return recipeRecordMapper.deleteByDateAndMeal(userId, dateString, mealType) > 0;
    }

    private String dayString(Date date) {
        java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd");
        format.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        return format.format(date);
    }

    private void checkPlanVersion(RecipeRecord record) {
        recipeRecordMapper.lockUser(record.getUserId());
        if(record.getExpectedRevision()==null)return;
        String day=record.getRecordDateString();
        if(day==null)day=new Date(record.getRecordDate().getTime()).toInstant().atZone(java.time.ZoneId.of("Asia/Shanghai")).toLocalDate().toString();
        RecipeRecord current=recipeRecordMapper.findSlot(record.getUserId(),day,record.getMealType());
        long revision=current==null?0:current.getRevision();
        if(revision!=record.getExpectedRevision())throw new MealConsumptionService.VersionConflict("安排已更新，请重新加载后确认");
    }

    private void validatePlan(RecipeRecord record) {
        String day = record.getRecordDateString();
        if (day == null && record.getRecordDate() != null) day = dayString(record.getRecordDate());
        if (day == null) throw new IllegalArgumentException("请指定日期");
        record.setRecordDateString(java.time.LocalDate.parse(day).toString());
        if (record.getIsManual() != null && record.getIsManual() != 0 && record.getIsManual() != 1) throw new IllegalArgumentException("安排类型无效");
        if (record.getTargetPeople() == null) record.setTargetPeople(2);
        if (record.getTargetPeople() < 1 || record.getTargetPeople() > 50) throw new IllegalArgumentException("人数应为 1 至 50");
        if(!Arrays.asList("breakfast","lunch","dinner").contains(record.getMealType()))throw new IllegalArgumentException("餐次无效");
        if(record.getRecipeName()==null||record.getRecipeName().trim().isEmpty()||record.getRecipeName().length()>255)throw new IllegalArgumentException("请填写有效的安排名称");
        if(record.getDishIds().size()>30)throw new IllegalArgumentException("一餐最多 30 道菜");
        List<Dish> trusted=dishQueryService.getDishesByIdsForUser(record.getDishIds(),record.getUserId());
        Set<Long> ids=trusted.stream().map(Dish::getId).collect(Collectors.toSet());
        if(!ids.containsAll(record.getDishIds()))throw new IllegalArgumentException("菜品不存在或无权访问");
        record.setDishDetails(trusted);
        record.setRecordOrigin("manual");
    }

    /**
     * 获取饮食统计数据
     */
    public StatisticsDTO getStatistics(Long userId, Date startDate, Date endDate) {
        // 查询日期范围内的所有记录
        List<RecipeRecord> records = recipeRecordMapper.selectRecordsByUserAndRange(userId, dayString(startDate), dayString(endDate));

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
