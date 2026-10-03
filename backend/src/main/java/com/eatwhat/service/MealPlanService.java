package com.eatwhat.service;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.*;
import com.eatwhat.util.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class MealPlanService {
    private final RecipeRecordService service;
    private final RecipeRecordMapper plans;
    private final MealConsumptionMapper logs;
    private final ObjectMapper json;
    public MealPlanService(RecipeRecordService service,RecipeRecordMapper plans,MealConsumptionMapper logs,ObjectMapper json) {
        this.service=service;
        this.plans=plans;
        this.logs=logs;
        this.json=json;
    }
    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        }
        catch(Exception e) {
            throw new IllegalStateException("安排序列化失败",e);
        }
    }
    @Transactional
    public Map<String,Object> mutate(Long userId,String day,String meal,RecipeRecord body,boolean remove) {
        LocalDate date=MealConsumptionService.date(day);
        if(!Arrays.asList("breakfast","lunch","dinner").contains(meal))throw new IllegalArgumentException("餐次无效");
        RequestIdValidator.requireValid(body.getRequestId());
        if(body.getExpectedRevision()==null||body.getExpectedRevision()<0)throw new IllegalArgumentException("请提供安排版本");
        if(logs.lockUser(userId)==null)throw new IllegalArgumentException("用户不存在");
        String hash=WorkflowRequestHash.sha256("plan|"+day+"|"+meal+"|"+remove+"|"+encode(body));
        Map<String,Object> prior=logs.request(userId,body.getRequestId());
        if(prior!=null) {
            if(!hash.equals(prior.get("requestHash")))throw new MealConsumptionService.VersionConflict("请求标识已用于另一操作");
            try {
                return json.readValue(String.valueOf(prior.get("responseJson")),new TypeReference<Map<String,Object>>() {
                }
                );
            }
            catch(Exception e) {
                throw new IllegalStateException("安排执行记录无法读取",e);
            }
        }
        RecipeRecord current=plans.findSlot(userId,day,meal);
        long revision=current==null?0:current.getRevision();
        if(revision!=body.getExpectedRevision())throw new MealConsumptionService.VersionConflict("安排已更新，请重新加载");
        Map<String,Object> response=new LinkedHashMap<>();
        if(remove) {
            if(current!=null)service.deleteRecordByDateAndMeal(userId,day,meal);
            response.put("removed",true);
        }
        else {
            RecipeRecord record = new RecipeRecord();
            record.setTargetPeople(body.getTargetPeople() == null ? 2 : body.getTargetPeople());
            if(record.getTargetPeople()<1||record.getTargetPeople()>50)throw new IllegalArgumentException("人数应为 1 至 50");
            record.setUserId(userId);
            record.setMealType(meal);
            record.setRecordDateString(day);
            record.setRecordDate(Date.from(date.atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant()));
            record.setRecipeName(body.getRecipeName());
            record.setDishIds(body.getDishIds());
            record.setIsManual(body.getIsManual() == null ? 0 : body.getIsManual());
            record.setExpectedRevision(body.getExpectedRevision());
            service.saveRecipeRecord(record);
            response.put("plan",plans.selectByUserAndDate(userId,day).stream().filter(p->meal.equals(p.getMealType())).findFirst().orElse(null));
        }
        logs.log(userId,body.getRequestId(),hash,encode(response));
        return response;
    }
}
