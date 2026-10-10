package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class RecommendationHistoryEvidenceTest {
    // Pure scorer + fixed parsed snapshots only. No planner, Spring, transport or model mock.
    private final RecommendationScorer scorer = new RecommendationScorer();
    private Dish dish(long id) { Dish d=new Dish();d.setId(id);d.setName("鸡肉");return d; }
    @Test void actualKnownIdIsDownweightedWithoutPermanentExclusion() {
        Set<Long> recent=scorer.recentActualIds("eaten", Collections.singletonList(Collections.singletonMap("dishId", 7)));
        assertEquals(Collections.singleton(7L),recent);
        assertEquals(-40,scorer.score(dish(7),null,Collections.emptySet(),recent));
        assertEquals(0,scorer.score(dish(8),null,Collections.emptySet(),recent));
        assertEquals(0,scorer.score(dish(7),null,Collections.emptySet(),Collections.emptySet()));
    }
    @Test void arbitraryFreeTextNeverGuessesIdentity() {
        Map<String,Object> text=new HashMap<>();text.put("name","鸡肉 7 dishId=7");
        assertTrue(scorer.recentActualIds("eaten",Collections.singletonList(text)).isEmpty());
        for(Object id:Arrays.asList("鸡肉",0,-1,1.5,"07"))
            assertTrue(scorer.recentActualIds("eaten",Collections.singletonList(Collections.singletonMap("dishId",id))).isEmpty());
    }
    @Test void onlyPlansSkippedAndUnrecordedCannotEnterRecentActual() {
        List<Map<String,Object>> entries=Collections.singletonList(Collections.singletonMap("dishId",7));
        for(String status:Arrays.asList("plan","skipped","unrecorded",null))
            assertTrue(scorer.recentActualIds(status,entries).isEmpty());
    }
}
