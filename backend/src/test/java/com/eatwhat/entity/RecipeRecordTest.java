package com.eatwhat.entity;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;

class RecipeRecordTest {

    @Test
    void dishIdsRoundTripBetweenListAndJson() {
        RecipeRecord record = new RecipeRecord();
        record.setDishIds(Arrays.asList(1L, 2L, 3L));

        assertEquals("[1,2,3]", record.getDishIdsString());
        assertEquals(Arrays.asList(1L, 2L, 3L), record.getDishIds());
    }

    @Test
    void invalidDishIdJsonFallsBackToEmptyList() {
        RecipeRecord record = new RecipeRecord();
        record.setDishIdsString("not-json");
        assertEquals(Collections.emptyList(), record.getDishIds());
    }

    @Test
    void dishDetailsRoundTrip() {
        Dish dish = new Dish();
        dish.setId(9L);
        dish.setName("test dish");
        RecipeRecord record = new RecipeRecord();
        record.setDishDetails(Collections.singletonList(dish));

        assertEquals(1, record.getDishDetails().size());
        assertTrue(record.getDishDetailsString().contains("test dish"));
    }
}
