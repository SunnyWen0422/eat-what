package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecommendationScorerTest {

    @Test
    void scoreCombinesCuisineTagsFavoriteAndRecentSignals() {
        Dish dish = new Dish();
        dish.setId(7L);
        dish.setCuisineCode("SICHUAN");
        dish.setTagCodes("HOME_STYLE,SPICY");

        EffectiveRecommendationCriteria criteria = new EffectiveRecommendationCriteria();
        criteria.setPreferredCuisineCodes(Collections.singletonList("SICHUAN"));
        criteria.setPreferredTagCodes(Arrays.asList("HOME_STYLE", "QUICK"));

        int score = new RecommendationScorer().score(
                dish,
                criteria,
                Collections.singleton(7L),
                Collections.singleton(7L));

        assertEquals(12, score);
    }
}
