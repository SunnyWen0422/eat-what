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
    private HistoricalRecipeNutritionService historicalNutrition;
    @org.springframework.beans.factory.annotation.Autowired
    public void setHistoricalNutrition(HistoricalRecipeNutritionService service){historicalNutrition=service;}
    private final ObjectMapper json;
    public DietReviewCalculator(ObjectMapper json) {
        this.json = json;
    }
    public Map<String,Object> report(Long userId, List<MealConsumption> meals, List<RecipeRecord> plans,
                                     LocalDate start, LocalDate end, java.time.Instant generatedAt) {
        return new DietReviewReport(json, this, historicalNutrition).build(userId, meals, plans, start, end, generatedAt);
    }
    public Map<String,Object> calculate(List<MealConsumption> meals,List<RecipeRecord> plans,LocalDate today) {
        Set<String> days = new TreeSet<>();
        Map<String,Integer> categories = new LinkedHashMap<>();
        Map<String,Map<String,Object>> popular = new LinkedHashMap<>();
        Map<String,Integer> daily = new TreeMap<>();
        int mealCount=0, entries=0, unknown=0;
        for (MealConsumption meal:MealRecordProjection.from(plans)) {
            if(LocalDate.parse(meal.getMealDate()).isAfter(today))continue;
            mealCount++;days.add(meal.getMealDate());daily.merge(meal.getMealDate(),1,Integer::sum);
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
        result.put("description","按已保存的餐次记录汇总；未来菜单到对应日期计入。主料营养参考不含调味料和辅料，不代表整道菜总营养或个人实际摄入。");
        return result;
    }
}
