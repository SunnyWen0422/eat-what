package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomDishServiceTest {

    @Mock
    private DishMapper mapper;
    private CustomDishService service;

    @BeforeEach
    void setUp() {
        service = new CustomDishService(mapper);
    }

    @Test
    void createForcesAuthenticatedOwnershipAndCustomFlag() {
        Dish dish = dish(10L, "custom", "veg");

        assertSame(dish, service.createDish(5L, dish));

        assertEquals(5L, dish.getUserId());
        assertEquals(1, dish.getIsCustom());
        verify(mapper).insert(dish);
    }

    @Test
    void createRejectsMissingOwnerOrName() {
        assertThrows(IllegalArgumentException.class, () -> service.createDish(null, dish(1L, "x", "veg")));
        assertThrows(IllegalArgumentException.class, () -> service.createDish(5L, dish(1L, " ", "veg")));
        assertThrows(IllegalArgumentException.class, () -> service.createDish(5L, dish(1L, "x", "unknown")));
    }

    @Test
    void createNormalizesTextAndRejectsIncompleteDetails() {
        Dish normalized = dish(1L, "  番茄炒蛋  ", " VEG ");
        normalized.setCl("  番茄#鸡蛋  ");
        normalized.setStep("  炒熟  ");

        service.createDish(5L, normalized);

        assertEquals("番茄炒蛋", normalized.getName());
        assertEquals("veg", normalized.getType());
        assertEquals("番茄#鸡蛋", normalized.getCl());
        assertEquals("炒熟", normalized.getStep());

        Dish missingIngredients = dish(1L, "x", "veg");
        missingIngredients.setCl(" ");
        assertThrows(IllegalArgumentException.class, () -> service.createDish(5L, missingIngredients));
    }

    @Test
    void removalRequiresOwnershipIdentifiers() {
        when(mapper.deleteCustomDish(5L, 10L)).thenReturn(1);
        assertTrue(service.removeCustomDish(5L, 10L));
        assertFalse(service.removeCustomDish(null, 10L));
        assertFalse(service.removeCustomDish(5L, null));
        verify(mapper).deleteCustomDish(5L, 10L);
    }

    private Dish dish(Long id, String name, String type) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setName(name);
        dish.setType(type);
        dish.setCl("食材");
        dish.setStep("步骤");
        return dish;
    }
}
