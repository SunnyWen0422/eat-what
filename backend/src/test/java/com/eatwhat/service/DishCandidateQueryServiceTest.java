package com.eatwhat.service;

import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DishCandidateQueryServiceTest {

    @Test
    void queryUsesAuthenticatedOwnershipAndAppliesHardExclusionsBeforeCap() {
        DishMapper mapper = mock(DishMapper.class);
        Dish allowed = dish(1L, "HOME_STYLE", "chicken");
        Dish excludedTag = dish(2L, "FRY", "beef");
        Dish excludedIngredient = dish(3L, "HOME_STYLE", "peanut chicken");
        when(mapper.selectFilteredCandidates(
                eq(7L), eq("meat"), eq("dish"),
                eq(Collections.singletonList("SICHUAN")),
                eq(Arrays.asList("SPICY", "LIGHT")), eq(30)))
                .thenReturn(Arrays.asList(allowed, excludedTag, excludedIngredient));

        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setCuisineCodes(Collections.singletonList("SICHUAN"));
        criteria.setIncludeTagCodes(Arrays.asList("SPICY", "LIGHT"));
        criteria.setExcludeTagCodes(Collections.singletonList("FRY"));
        criteria.setExcludedIngredients(Collections.singletonList("peanut"));
        criteria.setMaxCookMinutes(30);

        List<Dish> result = new DishCandidateQueryService(mapper)
                .findForUser(7L, "meat", "dish", criteria, 400);

        assertEquals(Collections.singletonList(1L), Collections.singletonList(result.get(0).getId()));
        assertEquals(1, result.size());
        verify(mapper).selectFilteredCandidates(
                7L, "meat", "dish",
                Collections.singletonList("SICHUAN"),
                Arrays.asList("SPICY", "LIGHT"), 30);
    }

    private Dish dish(Long id, String tagCodes, String ingredients) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setTagCodes(tagCodes);
        dish.setIngredientsAmounts(ingredients);
        return dish;
    }
}
