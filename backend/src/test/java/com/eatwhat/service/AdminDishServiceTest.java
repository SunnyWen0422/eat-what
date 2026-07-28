package com.eatwhat.service;

import com.eatwhat.dto.AdminDishPageDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminDishServiceTest {
    @Mock private DishMapper dishMapper;
    @Mock private CustomDishService customDishService;

    @Test
    void listNormalizesScopeAndClampsPageSize() {
        when(dishMapper.countAdmin("system", "豆腐", "veg", null, null)).thenReturn(1);
        when(dishMapper.selectAdminPage("system", "豆腐", "veg", null, null, 50, 0))
                .thenReturn(Collections.emptyList());

        AdminDishPageDTO result = new AdminDishService(dishMapper, customDishService)
                .list(null, " 豆腐 ", " VEG ", null, null, 1, 100);

        assertEquals(1, result.getTotal());
        assertEquals(50, result.getPageSize());
        assertTrue(!result.isHasMore());
        verify(dishMapper).selectAdminPage("system", "豆腐", "veg", null, null, 50, 0);
    }

    @Test
    void publicationRejectsUnchangedState() {
        Dish existing = dish(8L, 0, 1);
        when(dishMapper.selectAdminById(8L)).thenReturn(existing);

        assertThrows(IllegalStateException.class,
                () -> new AdminDishService(dishMapper, customDishService).updatePublication(8L, 1));
    }

    @Test
    void systemUpdateKeepsSystemOwnershipAndReloads() {
        Dish existing = dish(8L, 0, 1);
        Dish input = dish(8L, 0, 1);
        input.setName("new");
        when(dishMapper.selectAdminById(8L)).thenReturn(existing, existing);
        when(dishMapper.updateSystemDish(input)).thenReturn(1);

        Dish result = new AdminDishService(dishMapper, customDishService).updateSystem(input);

        assertEquals(existing, result);
        assertEquals(0, input.getIsCustom());
        assertEquals(null, input.getUserId());
        verify(customDishService).normalizeDish(input);
        verify(dishMapper).updateSystemDish(input);
    }

    private Dish dish(Long id, int custom, int published) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setName("dish");
        dish.setType("veg");
        dish.setCl("豆腐");
        dish.setStep("烹饪");
        dish.setIsCustom(custom);
        dish.setIsPublished(published);
        return dish;
    }
}
