package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.service.CustomDishService;
import com.eatwhat.service.DishQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.http.ResponseEntity;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CustomDishControllerTest {
    @Test
    void updateAndDeleteRequireOwnerAndExposeNotFound() {
        DishQueryService queryService = mock(DishQueryService.class);
        CustomDishService customService = mock(CustomDishService.class);
        DishController controller = new DishController(queryService, customService);
        MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/dishes/custom/10");
        request.setAttribute("currentUserId", 7L);
        Dish input = new Dish();
        input.setName("updated");
        input.setType("veg");
        when(customService.updateDish(7L, 10L, input)).thenReturn(null);

        ResponseEntity<?> update = controller.updateCustomDish(10L, input, request);
        assertEquals(404, update.getStatusCodeValue());

        when(customService.removeCustomDish(7L, 10L)).thenReturn(false);
        ResponseEntity<?> delete = controller.deleteCustomDish(10L, request);
        assertEquals(404, delete.getStatusCodeValue());

        assertEquals(401, controller.deleteCustomDish(10L,
                new MockHttpServletRequest("DELETE", "/dishes/custom/10")).getStatusCodeValue());
    }
}
