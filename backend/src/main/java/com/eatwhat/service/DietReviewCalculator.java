package com.eatwhat.service;
import com.eatwhat.entity.MealConsumption;
import com.eatwhat.entity.RecipeRecord;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import java.time.LocalDate;
import java.util.*;

@Component
public class DietReviewCalculator {
    private final ObjectMapper json;
    public DietReviewCalculator(ObjectMapper json) {
        this.json = json;
    }
    public Map<String,Object> calculate(List<MealConsumption> meals,List<RecipeRecord> plans,LocalDate today) {
        Set<String> days = new TreeSet<>();
        Map<String,Integer> categories = new LinkedHashMap<>();
        Map<String,Map<String,Object>> popular = new LinkedHashMap<>();
        Map<String,Integer> daily = new TreeMap<>();
        int mealCount=0, entries=0, unknown=0, plannedEaten=0, followed=0, skipped=0;
        Set<String> dueSlots = new HashSet<>();
        for (RecipeRecord plan : plans) {
            if (plan.getRecordDate() == null || !"manual".equals(plan.getRecordOrigin())) continue;
            LocalDate day = LocalDate.parse(plan.calendarDay());
            if (day.isBefore(today)) dueSlots.add(day + "|" + plan.getMealType());
        }
        for (MealConsumption meal:meals) {
            boolean plannedPast = false, asPlanned = false;
            if (LocalDate.parse(meal.getMealDate()).isBefore(today) && meal.getSourceRecordId() != null                     && meal.getPlannedSnapshotJson() != null && !"unrecorded".equals(meal.getStatus())) {
                try {
                    Map<String,Object> snapshot = json.readValue(meal.getPlannedSnapshotJson(), new TypeReference<Map<String,Object>>() {
                    }
                    );
                    plannedPast = "manual".equals(snapshot.get("recordOrigin"));
                    asPlanned = Boolean.TRUE.equals(snapshot.get("confirmedAsPlanned"));
                }
                catch (Exception error) {
                    throw new IllegalStateException("计划快照无法读取", error);
                }
            }
            if (plannedPast) dueSlots.add(meal.getMealDate() + "|" + meal.getMealType());
            if ("skipped".equals(meal.getStatus())) {
                if (plannedPast) skipped++;
                continue;
            }
            if (!"eaten".equals(meal.getStatus())) continue;
            mealCount++;
            days.add(meal.getMealDate());
            daily.merge(meal.getMealDate(),1,Integer::sum);
            if (plannedPast) {
                plannedEaten++;
                if (asPlanned) followed++;
            }
            List<Map<String,Object>> dishes;
            try {
                dishes=json.readValue(meal.getActualDishesJson(),new TypeReference<List<Map<String,Object>>>() {
                }
                );
            }
            catch(Exception e) {
                throw new IllegalStateException("实际用餐快照无法读取",e);
            }
            Set<String> seen = new HashSet<>();
            for(Map<String,Object> dish:dishes) {
                entries++;
                String type=String.valueOf(dish.getOrDefault("type","unknown"));
                if(!Arrays.asList("meat","veg","soup","staple","dessert").contains(type)) {
                    unknown++;
                    type="unknown";
                }
                categories.merge(type,1,Integer::sum);
                if(dish.get("dishId")==null) continue;
                String key=String.valueOf(dish.get("dishId"));
                if(!seen.add(key)) continue;
                Map<String,Object> item=popular.computeIfAbsent(key,k-> {
                    Map<String,Object> v=new LinkedHashMap<>();v.put("dishId",key);v.put("name",dish.get("name"));v.put("count",0);return v;
                }
                );
                item.put("count",(Integer)item.get("count")+1);
            }
        }
        List<Map<String,Object>> ranking=new ArrayList<>(popular.values());
        ranking.sort(Comparator.<Map<String,Object>,Integer>comparing(x->(Integer)x.get("count")).reversed().thenComparing(x->String.valueOf(x.get("dishId"))));
        int due=dueSlots.size();
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("mealCount",mealCount);
        result.put("recordedDays",days.size());
        result.put("uniqueDishCount",popular.size());
        result.put("entryCount",entries);
        result.put("unclassifiedCount",unknown);
        result.put("classifiedCount",entries-unknown);
        result.put("categories",categories);
        result.put("popularDishes",ranking);
        result.put("dailyMeals",daily);
        result.put("plannedMealsDue",due);
        result.put("plannedMealsEaten",plannedEaten);
        result.put("plannedMealsFollowed",followed);
        result.put("plannedMealsChanged",plannedEaten-followed);
        result.put("skippedMeals",skipped);
        result.put("unconfirmedMeals",Math.max(0,due-plannedEaten-skipped));
        result.put("description","仅统计明确标记吃过的餐次；菜品类别次数不代表营养摄入。历史安排未自动计入。执行情况以昨日及以前为范围。");
        return result;
    }
}
