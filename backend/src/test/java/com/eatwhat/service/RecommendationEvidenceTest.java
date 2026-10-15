package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class RecommendationEvidenceTest {
    final RecommendationScorer scorer=new RecommendationScorer();
    Dish dish(){Dish d=new Dish();d.setId(1L);d.setName("洋葱炒蛋");d.setCl("洋葱#鸡蛋");d.setTagCodes("LIGHT");d.setCookMinutes(10);return d;}
    @Test void unknownTimeAndSubstringIngredientsCannotBecomePositiveReasons(){
        Dish d=dish();EffectiveRecommendationCriteria c=new EffectiveRecommendationCriteria();c.setMaxCookMinutes(15);
        Map<String,Object> evidence=scorer.evidence(Collections.singletonList(d),c,Collections.singletonList("葱"),Collections.emptySet());
        assertFalse(((List<?>)evidence.get("codes")).contains("OWNED_INGREDIENT_MATCH"));
        assertFalse(((List<?>)evidence.get("codes")).contains("KNOWN_TIME_MATCH"));
        assertTrue(((List<?>)evidence.get("unknownFields")).contains("cookMinutes"));
    }
    @Test void explanationsAreBoundedAndReferToRealScoringFacts(){
        Dish d=dish();EffectiveRecommendationCriteria c=new EffectiveRecommendationCriteria();c.setPreferredTagCodes(Collections.singletonList("LIGHT"));c.setAvoidRecentDays(7);
        Map<String,Object> evidence=scorer.evidence(Collections.singletonList(d),c,Collections.singletonList("鸡蛋"),Collections.singleton(99L));
        assertTrue(((List<?>)evidence.get("codes")).contains("OWNED_INGREDIENT_MATCH"));
        assertTrue(((List<?>)evidence.get("codes")).contains("EXPLICIT_PREFERENCE_MATCH"));
        assertNotNull(evidence.get("sourceVersion"));
        assertEquals(2,scorer.explanations(evidence).size());
        assertEquals(5,scorer.ownedIngredientScore(d,Collections.singletonList("鸡蛋")));
    }
    @Test void recentHistoryRemainsASoftPenaltyAndDoesNotInventPermanentRejection(){
        Dish d=dish();EffectiveRecommendationCriteria c=new EffectiveRecommendationCriteria();
        assertEquals(-40,scorer.score(d,c,Collections.emptySet(),Collections.singleton(1L)));
        assertFalse(((List<?>)scorer.evidence(Collections.singletonList(d),c,Collections.emptyList(),Collections.singleton(1L)).get("codes")).contains("RECENT_ACTUAL_AVOIDED"));
    }
}
