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
    @Transactional
    public MealConsumption save(Long userId,String day,String mealType,MealConsumptionRequest request) {
        LocalDate local=date(day);
        meal(mealType);
        RequestIdValidator.requireValid(request.getRequestId());
        if(request.getExpectedRevision()==null || request.getExpectedRevision()<0) throw new IllegalArgumentException("缺少有效的记录版本");
        if(!Arrays.asList("eaten","skipped","unrecorded").contains(request.getStatus())) throw new IllegalArgumentException("用餐状态无效");
        if("eaten".equals(request.getStatus())&&local.isAfter(LocalDate.now(ZoneId.of("Asia/Shanghai")))) throw new IllegalArgumentException("不能提前记录未来用餐");
        // One user-row lock also serializes first creation and duplicate request replay.
        if(mapper.lockUser(userId)==null) throw new IllegalArgumentException("用户不存在");
        String hash=com.eatwhat.util.WorkflowRequestHash.sha256(day+"|"+mealType+"|"+encode(request));
        Map<String,Object> prior=mapper.request(userId,request.getRequestId());
        if(prior!=null) {
            if(!hash.equals(prior.get("requestHash"))) throw new VersionConflict("同一请求标识已用于不同操作");
            try {
                return json.readValue(String.valueOf(prior.get("responseJson")),MealConsumption.class);
            }
            catch(Exception e) {
                throw new IllegalStateException("执行记录无法读取",e);
            }
        }
        MealConsumption current=mapper.find(userId,day,mealType);
        long version=current==null?0:current.getRevision();
        if(version!=request.getExpectedRevision())throw new VersionConflict("用餐记录已更新，请重新加载后确认");
        RecipeRecord plan=plans.selectByUserAndDate(userId,day).stream().filter(p->mealType.equals(p.getMealType())).findFirst().orElse(null);
        if (request.getExpectedPlanRevision() != null && request.getExpectedPlanRevision() != (plan == null ? 0 : plan.getRevision()))
        throw new VersionConflict("本餐安排已更新，请查看最新安排后确认");
        if (Boolean.TRUE.equals(request.getUsePlan()) && request.getExpectedPlanRevision() == null)
        throw new IllegalArgumentException("按计划确认时请提供安排版本");
        List<Map<String,Object>> actual=new ArrayList<>();
        if("eaten".equals(request.getStatus())) {
            if(Boolean.TRUE.equals(request.getUsePlan())) {
                if(plan==null)throw new IllegalArgumentException("本餐没有可确认的安排");
                Map<Long,Dish> snapshot=plannedDishes(plan);
                for(Long id:plan.getDishIds())actual.add(snapshot.isEmpty()?trustedDish(id,userId):dishEntry(snapshot.get(id)));
                if(actual.isEmpty())actual.add(freeEntry(plan.getRecipeName()));
            }
            else {
                if(request.getDishes()==null||request.getDishes().isEmpty()||request.getDishes().size()>30)throw new IllegalArgumentException("请填写 1 至 30 道实际吃过的菜");
                for(MealConsumptionRequest.Entry entry:request.getDishes()) {
                    if(entry==null)throw new IllegalArgumentException("菜品内容无效");
                    actual.add(entry.getDishId()==null?freeEntry(entry.getName()):trustedDish(entry.getDishId(),userId));
                }
            }
        }
        MealConsumption value=new MealConsumption();
        value.setUserId(userId);
        value.setMealDate(day);
        value.setMealType(mealType);
        value.setStatus(request.getStatus());
        value.setRevision(version+1);
        value.setActualDishesJson(encode(actual));
        if(plan!=null) {
            value.setSourceRecordId(plan.getId());
            Map<String,Object> snapshot=new LinkedHashMap<>();
            snapshot.put("name",plan.getRecipeName());
            snapshot.put("dishIds",plan.getDishIds());
            snapshot.put("revision",plan.getRevision());
            snapshot.put("recordOrigin",plan.getRecordOrigin());
            snapshot.put("confirmedAsPlanned",Boolean.TRUE.equals(request.getUsePlan()) && "eaten".equals(request.getStatus()));
            value.setPlannedSnapshotJson(encode(snapshot));
        }
        else if(current!=null) {
            value.setSourceRecordId(current.getSourceRecordId());
            if(current.getPlannedSnapshotJson()!=null) {
                try {
                    Map<String,Object> snapshot=json.readValue(current.getPlannedSnapshotJson(),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>() {
                    }
                    );
                    snapshot.put("confirmedAsPlanned",false);
                    value.setPlannedSnapshotJson(encode(snapshot));
                }
                catch(Exception error) {
                    throw new IllegalStateException("历史计划快照无法读取",error);
                }
            }
        }
        mapper.save(value);
        if (behavior!=null && "eaten".equals(value.getStatus())) behavior.domain(userId,day,mealType,request.getRequestId(),"actual_completed");
        hydrate(value);
        mapper.log(userId,request.getRequestId(),hash,encode(value));
        return value;
    }
    private Map<String,Object> freeEntry(String name) {
        if(name==null||name.trim().isEmpty()||name.trim().length()>255)throw new IllegalArgumentException("菜名需为 1 至 255 个字符");
        Map<String,Object> value=new LinkedHashMap<>();
        value.put("name",name.trim());
        return value;
    }
    private Map<String,Object> trustedDish(Long id,Long userId) {
        Dish dish=dishes.getDishById(id,userId);
        if(dish==null)throw new IllegalArgumentException("菜品不存在或无权访问");
        return dishEntry(dish);
    }
    private Map<Long,Dish> plannedDishes(RecipeRecord plan) {
        Map<Long,Dish> snapshots=new LinkedHashMap<>();
        // New plans contain server-validated snapshots; legacy plans retain the old lookup path.
        if(!"manual".equals(plan.getRecordOrigin())||plan.getDishDetailsString()==null||plan.getDishDetailsString().trim().isEmpty())return snapshots;
        try {
            List<Dish> saved=json.readValue(plan.getDishDetailsString(),new TypeReference<List<Dish>>(){});
            for(Dish dish:saved) {if(dish==null||dish.getId()==null)throw new IllegalArgumentException("快照缺少菜品标识");snapshots.put(dish.getId(),dish);}
        } catch(Exception e) {throw new IllegalStateException("计划快照无法读取，请核对本餐安排",e);}
        if(!snapshots.keySet().containsAll(plan.getDishIds()))throw new IllegalStateException("计划快照不完整，请核对本餐安排");
        return snapshots;
    }
    private Map<String,Object> dishEntry(Dish dish) {
        Map<String,Object> value=freeEntry(dish.getName());
        value.put("dishId",String.valueOf(dish.getId()));
        String type=dish.getType();
        Map<String,String> names=new HashMap<>();
        names.put("荤菜","meat");
        names.put("素菜","veg");
        names.put("汤","soup");
        names.put("汤品","soup");
        names.put("主食","staple");
        names.put("甜品","dessert");
        value.put("type",names.getOrDefault(type,type));
        return value;
    }
    @Transactional(readOnly=true)
    public Map<String,Object> overview(Long userId,String start,String end) {
        LocalDate a=date(start),b=date(end);
        if(b.isBefore(a)||java.time.temporal.ChronoUnit.DAYS.between(a,b)>366)throw new IllegalArgumentException("日期范围应在 367 天以内");
        List<RecipeRecord> records=plans.selectRangeDays(userId,a.toString(),b.toString());
        List<MealConsumption> actual=mapper.range(userId,start,end);
        actual.forEach(this::hydrate);
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("plans",records);
        result.put("consumptions",actual);
        Map<String,Long> revisions = new LinkedHashMap<>();
        for (RecipeRecord slot : plans.slotRevisions(userId,start,end)) revisions.put(slot.getRecordDateString()+"|"+slot.getMealType(),slot.getRevision());
        result.put("planRevisions",revisions);
        return result;
    }
    @Transactional(readOnly=true)
    @SuppressWarnings("unchecked")
    public Map<String,Object> review(Long userId,String start,String end) {
        Map<String,Object> overview=overview(userId,start,end);
        Map<String,Object> result=calculator.calculate((List<MealConsumption>)overview.get("consumptions"),(List<RecipeRecord>)overview.get("plans"),LocalDate.now(ZoneId.of("Asia/Shanghai")));
        result.put("consumptions",overview.get("consumptions"));
        return result;
    }
    public static class VersionConflict extends RuntimeException {
        public VersionConflict(String message) {
            super(message);
        }
    }
}
