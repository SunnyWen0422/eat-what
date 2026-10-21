package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.time.format.DateTimeFormatterBuilder;
import java.util.*;

/** Uses only new typed feedback. Favorites and legacy 'replaced' logs are deliberately absent. */
@Service
public class RecommendationLearningService {
    private final RecommendationFeedbackMapper db;private final MealConsumptionMapper locks;private final TransactionTemplate tx;private final ObjectMapper json;private final BalancedRecommendationPolicy policy;
    public RecommendationLearningService(RecommendationFeedbackMapper db,MealConsumptionMapper locks,TransactionTemplate tx,ObjectMapper json,RecommendationMetadataService metadata){this.db=db;this.locks=locks;this.tx=tx;this.json=json;this.policy=new BalancedRecommendationPolicy(metadata);}
    private static String timestamp(Instant value){return new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(value);}
    public Map<String,Double> weights(Long user){Instant now=Instant.now();return calculate(db.recent(user,timestamp(now.minus(Duration.ofDays(90)))),now);}
    public void record(Long user,MealWorkspace w,String type,List<Dish> dishes){
        if(!Arrays.asList("exposed","accepted","single_replaced").contains(type))return;
        if("single_replaced".equals(type))w.getDraft().setReplacementFeedbackVersion(w.getDraft().getPlanVersion());
        for(Dish dish:dishes){Map<String,Object> row=new LinkedHashMap<>();row.put("user",user);row.put("date",w.getContext().getDate());row.put("meal",w.getContext().getMealType());row.put("key",WorkflowRequestHash.sha256(BalancedRecommendationPolicy.identity(dish)));row.put("type",type);row.put("workspace",w.getId());row.put("version",w.getDraft().getPlanVersion());row.put("dish",dish.getId());row.put("policy",BalancedRecommendationPolicy.VERSION);row.put("at",timestamp(Instant.now()));
            try{row.put("features",json.writeValueAsString(policy.features(dish)));}catch(Exception e){throw new IllegalStateException("偏好反馈保存失败",e);}db.record(row);
        }
    }
    public void undo(Long user,MealWorkspace w){Long version=w.getDraft().getReplacementFeedbackVersion();if(version!=null)db.undoReplacement(user,w.getId(),version);}
    public void reset(Long user,String request){RequestIdValidator.requireValid(request);tx.execute(status->{if(user==null||locks.lockUser(user)==null)throw new IllegalArgumentException("请先登录");if(db.reset(user,request)==1)db.clear(user);return null;});}
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=3600000)
    public void purge(){db.purge(timestamp(Instant.now().minus(Duration.ofDays(90))));}
    private static class Counts{double exposed,accepted,replaced;int opportunities;Set<String> dishes=new HashSet<>(),days=new HashSet<>();}
    public static Map<String,Double> calculate(List<Map<String,Object>> rows,Instant now){
        Map<String,Map<String,Object>> events=new LinkedHashMap<>();if(rows==null)return Collections.emptyMap();ObjectMapper json=new ObjectMapper();
        for(Map<String,Object> r:rows){String type=String.valueOf(r.get("eventType"));if(!Arrays.asList("exposed","accepted","single_replaced").contains(type))continue;
            Instant at;try{at=Instant.parse(String.valueOf(r.get("occurredAt")));}catch(Exception ignored){continue;}if(at.isAfter(now)||at.isBefore(now.minus(Duration.ofDays(90))))continue;
            String key=r.get("mealDate")+"|"+r.get("mealType")+"|"+r.get("dishKey");events.putIfAbsent(key+"|"+type,r);
        }
        Map<String,Counts> counts=new LinkedHashMap<>();
        for(Map.Entry<String,Map<String,Object>> entry:events.entrySet()){
            Map<String,Object> r=entry.getValue();String type=String.valueOf(r.get("eventType"));String key=entry.getKey().substring(0,entry.getKey().lastIndexOf('|'));
            // A positive/negative signal without a recorded opportunity is not training data.
            Map<String,Object> exposure=events.get(key+"|exposed");if(exposure==null)continue;
            Instant at=Instant.parse(String.valueOf(r.get("occurredAt")));double decay=Math.pow(.5,Duration.between(at,now).toMillis()/(30.0*86400000));
            Set<String> features;try{features=new LinkedHashSet<>(json.readValue(String.valueOf(exposure.get("featuresJson")),List.class));}catch(Exception ignored){continue;}
            for(String feature:features){Counts c=counts.computeIfAbsent(feature,k->new Counts());if("exposed".equals(type)){c.exposed+=decay;c.opportunities++;c.dishes.add(String.valueOf(r.get("dishKey")));c.days.add(at.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().toString());}else if("accepted".equals(type))c.accepted+=decay;else c.replaced+=decay;}
        }
        Map<String,Double> result=new LinkedHashMap<>();counts.forEach((feature,c)->{if(c.opportunities>=10&&c.dishes.size()>=3&&c.days.size()>=2)result.put(feature,1+.2*Math.max(-1,Math.min(1,(c.accepted-c.replaced)/(c.exposed+5))));});return result;
    }
}
