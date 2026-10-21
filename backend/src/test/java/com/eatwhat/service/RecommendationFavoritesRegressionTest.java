package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class RecommendationFavoritesRegressionTest {
    @Test void collectingARecipeMustNotChangeItsRecommendationScore() {
        Dish dish=new Dish(); dish.setId(1L); dish.setName("清炒时蔬");
        RecommendationScorer scorer=new RecommendationScorer();
        assertEquals(scorer.score(dish,new EffectiveRecommendationCriteria(),Collections.emptySet(),Collections.emptySet()),
                scorer.score(dish,new EffectiveRecommendationCriteria(),Collections.singleton(1L),Collections.emptySet()));
    }
}
