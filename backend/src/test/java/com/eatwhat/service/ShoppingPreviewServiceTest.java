package com.eatwhat.service;

import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.dto.ShoppingPreviewResponse;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ShoppingPreviewServiceTest {
    @Test
    void buildsIndependentDishGroups() {
        DishQueryService query = mock(DishQueryService.class);
        Dish first = dish(1L, "炸猪排");
        Dish second = dish(2L, "葱烧大排");
        when(query.getDishesByIdsForUser(Collections.singletonList(1L), 9L)).thenReturn(Collections.singletonList(first));
        ShoppingPreviewService service = new ShoppingPreviewService(query, new IngredientParserService(), new IngredientNormalizationService());
        ShoppingPreviewRequest request = new ShoppingPreviewRequest();
        request.setDishIds(Collections.singletonList(1L));
        request.setTargetPeople(new BigDecimal("4"));
        ShoppingPreviewResponse response = service.createPreview(9L, request);
        assertEquals(1, response.getDishes().size());
        assertEquals("炸猪排", response.getDishes().get(0).getDishName());
        assertEquals(690, response.getDishes().get(0).getItems().get(0).getQuantityValue().intValue());
    }

    private Dish dish(Long id, String name) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setName(name);
        dish.setIngredientsAmounts("猪排|345|克|主料|切片");
        dish.setFl("2名成年人总量+15%冗余");
        return dish;
    }
}
