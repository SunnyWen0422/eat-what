package com.eatwhat.service;

import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.dto.UserPreferenceDTO;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecommendationCriteriaResolverTest {

    private final RecommendationCriteriaResolver resolver = new RecommendationCriteriaResolver();

    @Test
    void permanentAndSessionExclusionsAreMergedWithoutWeakeningLimits() {
        UserPreferenceDTO saved = new UserPreferenceDTO();
        saved.setPreferredCuisineCodes(Collections.singletonList("SICHUAN"));
        saved.setPreferredTagCodes(Collections.singletonList("HOME_STYLE"));
        saved.setExcludedTagCodes(Collections.singletonList("FRY"));
        saved.setExcludedIngredients(Collections.singletonList("花生"));
        saved.setMaxCookMinutes(45);
        saved.setAvoidRecentDays(14);

        RecommendationCriteria session = new RecommendationCriteria();
        session.setCuisineCodes(Collections.singletonList("CANTONESE"));
        session.setIncludeTagCodes(Collections.singletonList("QUICK"));
        session.setExcludeTagCodes(Collections.singletonList("NUMB_SPICY"));
        session.setExcludedIngredients(Collections.singletonList("香菜"));
        session.setMaxCookMinutes(30);

        EffectiveRecommendationCriteria result = resolver.resolve(session, saved, true);

        assertEquals(Collections.singletonList("CANTONESE"), result.getCuisineCodes());
        assertEquals(Collections.singletonList("QUICK"), result.getIncludeTagCodes());
        assertEquals(Arrays.asList("FRY", "NUMB_SPICY"), result.getExcludeTagCodes());
        assertEquals(Arrays.asList("花生", "香菜"), result.getExcludedIngredients());
        assertEquals(Integer.valueOf(30), result.getMaxCookMinutes());
        assertEquals(Collections.singletonList("SICHUAN"), result.getPreferredCuisineCodes());
        assertEquals(Collections.singletonList("HOME_STYLE"), result.getPreferredTagCodes());
        assertEquals(14, result.getAvoidRecentDays());
    }

    @Test
    void permanentExclusionsAndTimeLimitStillApplyWhenPreferenceRankingIsDisabled() {
        UserPreferenceDTO saved = new UserPreferenceDTO();
        saved.setExcludedTagCodes(Collections.singletonList("FRY"));
        saved.setExcludedIngredients(Collections.singletonList("peanut"));
        saved.setMaxCookMinutes(45);

        EffectiveRecommendationCriteria result = resolver.resolve(new RecommendationCriteria(), saved, false);

        assertEquals(Collections.singletonList("FRY"), result.getExcludeTagCodes());
        assertEquals(Collections.singletonList("peanut"), result.getExcludedIngredients());
        assertEquals(Integer.valueOf(45), result.getMaxCookMinutes());
        assertEquals(Collections.emptyList(), result.getPreferredCuisineCodes());
        assertEquals(0, result.getAvoidRecentDays());
    }
}
