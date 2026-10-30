package com.eatwhat.service;
import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.RequestIdValidator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class MealConsumptionService {
    private HistoricalRecipeNutritionService historicalNutrition;
    @org.springframework.beans.factory.annotation.Autowired
    public void setHistoricalNutrition(HistoricalRecipeNutritionService service){historicalNutrition=service;}
    private MealBehaviorService behavior;
    @org.springframework.beans.factory.annotation.Autowired
    public void setMealBehaviorService(MealBehaviorService behavior) { this.behavior=behavior; }

    private final MealConsumptionMapper mapper;
    private final RecipeRecordMapper plans;
    private final DishQueryService dishes;
    private final ObjectMapper json;
    private final DietReviewCalculator calculator;
    public MealConsumptionService(MealConsumptionMapper mapper,RecipeRecordMapper plans,DishQueryService dishes,ObjectMapper json,DietReviewCalculator calculator) {
        this.mapper=mapper;
        this.plans=plans;
        this.dishes=dishes;
        this.json=json;
        this.calculator=calculator;
    }
    public static LocalDate date(String value) {
        try {
            return LocalDate.parse(value);
        }
        catch(Exception e) {
            throw new IllegalArgumentException("日期格式应为 yyyy-MM-dd");
        }
    }
    private static void meal(String value) {
        if(!Arrays.asList("breakfast","lunch","dinner").contains(value)) throw new IllegalArgumentException("餐次无效");
    }
    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        }
        catch(Exception e) {
            throw new IllegalStateException("序列化用餐记录失败",e);
        }
    }
    public MealConsumption hydrate(MealConsumption value) {
        if(value==null)return null;
        try {
            value.setActualDishes(json.readValue(value.getActualDishesJson(),new TypeReference<List<Map<String,Object>>>() {
            }
            ));
            value.setPlannedSnapshot(value.getPlannedSnapshotJson()==null?null:json.readValue(value.getPlannedSnapshotJson(),new TypeReference<Map<String,Object>>() {
            }
            ));
            return value;
        }
        catch(Exception e) {
            throw new IllegalStateException("用餐记录快照无法读取",e);
        }
    }
    /** Retired command: do not create a second writable representation of a meal. */
    public MealConsumption save(Long userId,String day,String mealType,MealConsumptionRequest request) {
        throw new IllegalArgumentException("请更新小程序，在日历中修改或删除这餐记录");
    }
    @Transactional(readOnly=true)
    public Map<String,Object> overview(Long userId,String start,String end) {
        LocalDate a=date(start),b=date(end);
        if(b.isBefore(a)||java.time.temporal.ChronoUnit.DAYS.between(a,b)>366)throw new IllegalArgumentException("日期范围应在 367 天以内");
        List<RecipeRecord> records=plans.selectRangeDays(userId,a.toString(),b.toString());
        if(historicalNutrition!=null)records=historicalNutrition.displayRecords(userId,records);
        List<MealConsumption> actual=MealRecordProjection.from(records);
        actual.forEach(this::hydrate);
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("plans",records);
        result.put("recordPolicy","calendar-records-v1");
        result.put("consumptions",actual);
        if(historicalNutrition!=null)result.put("nutritionVersion",historicalNutrition.currentVersion());
        Map<String,Long> revisions = new LinkedHashMap<>();
        for (RecipeRecord slot : plans.slotRevisions(userId,start,end)) revisions.put(slot.getRecordDateString()+"|"+slot.getMealType(),slot.getRevision());
        result.put("planRevisions",revisions);
        return result;
    }
    @Transactional(readOnly=true)
    @SuppressWarnings("unchecked")
    public Map<String,Object> review(Long userId,String start,String end) {
        LocalDate a=date(start),b=date(end);
        if(b.isBefore(a)||java.time.temporal.ChronoUnit.DAYS.between(a,b)>366)throw new IllegalArgumentException("日期范围应在 367 天以内");
        return calculator.report(userId, Collections.emptyList(),plans.selectRangeDays(userId,start,end),a,b,Instant.now());
    }
    public static class VersionConflict extends RuntimeException {
        public VersionConflict(String message) {
            super(message);
        }
    }
}
