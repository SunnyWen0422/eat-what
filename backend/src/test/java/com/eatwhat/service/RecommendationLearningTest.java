package com.eatwhat.service;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class RecommendationLearningTest {
    private final Instant now=Instant.parse("2026-10-21T12:00:00Z");
    private Map<String,Object> row(int n,String event,int days){Map<String,Object> r=new HashMap<>();r.put("mealDate","2026-10-"+(n+1));r.put("mealType","dinner");r.put("dishKey","dish"+(n%3));r.put("eventType",event);r.put("featuresJson","[\"flavor:LIGHT\"]");r.put("occurredAt",now.minus(Duration.ofDays(days)).toString());return r;}
    private List<Map<String,Object>> rows(int count,int days){List<Map<String,Object>> r=new ArrayList<>();for(int i=0;i<count;i++){r.add(row(i,"exposed",days+i%2));r.add(row(i,"accepted",days+i%2));}return r;}
    @Test void tenExposuresThreeDishesAndTwoDaysAreRequired(){assertTrue(RecommendationLearningService.calculate(rows(9,0),now).isEmpty());List<Map<String,Object>> oneDay=rows(10,0);oneDay.forEach(r->r.put("occurredAt",now.toString()));assertTrue(RecommendationLearningService.calculate(oneDay,now).isEmpty());assertTrue(RecommendationLearningService.calculate(rows(10,0),now).get("flavor:LIGHT")>1);}
    @Test void normalizedLearningDecaysAndStaysBounded(){double recent=RecommendationLearningService.calculate(rows(10,0),now).get("flavor:LIGHT"),old=RecommendationLearningService.calculate(rows(10,60),now).get("flavor:LIGHT");assertTrue(recent>old&&old>1);assertTrue(recent<=1.2);assertTrue(RecommendationLearningService.calculate(rows(10,91),now).isEmpty());}
    @Test void unknownEventsAndAcceptanceWithoutExposureCannotTeachTaste(){List<Map<String,Object>> data=rows(10,0);data.removeIf(r->"accepted".equals(r.get("eventType")));for(int i=0;i<50;i++)data.add(row(i,"favorite",0));assertEquals(1.0,RecommendationLearningService.calculate(data,now).get("flavor:LIGHT"));assertTrue(RecommendationLearningService.calculate(Collections.singletonList(row(1,"accepted",0)),now).isEmpty());}
    @Test void repeatedEventsDoNotMultiplyLearning(){List<Map<String,Object>> original=rows(10,0),repeated=new ArrayList<>(original);repeated.addAll(original);assertEquals(RecommendationLearningService.calculate(original,now),RecommendationLearningService.calculate(repeated,now));}
    @Test void twoDistinctDishesCannotStartLearningAndNegativeFeedbackStaysWeak(){
        List<Map<String,Object>> two=rows(10,0);for(int i=0;i<two.size();i++)two.get(i).put("dishKey","dish"+(i/2%2));assertTrue(RecommendationLearningService.calculate(two,now).isEmpty());
        List<Map<String,Object>> negative=rows(10,0);negative.forEach(r->{if("accepted".equals(r.get("eventType")))r.put("eventType","single_replaced");});double weight=RecommendationLearningService.calculate(negative,now).get("flavor:LIGHT");assertTrue(weight>=.8&&weight<1);
    }
}
