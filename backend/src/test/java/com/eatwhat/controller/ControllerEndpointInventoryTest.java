package com.eatwhat.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.*;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ControllerEndpointInventoryTest {

    private static final Class<?>[] CONTROLLERS = {
            UserController.class, DishController.class, RecommendController.class,
            FavoriteDishController.class, RecipeRecordController.class,
            AdminController.class, ChatController.class, UserPreferenceController.class
    };

    @Test
    void allDocumentedControllerEndpointsRemainRegisteredAndUnique() {
        Set<String> endpoints = new LinkedHashSet<>();
        for (Class<?> controller : CONTROLLERS) {
            String base = controller.getAnnotation(RequestMapping.class).value()[0];
            for (Method method : controller.getDeclaredMethods()) {
                String endpoint = endpoint(base, method);
                if (endpoint != null) {
                    assertTrue(endpoints.add(endpoint), "duplicate endpoint: " + endpoint);
                }
            }
        }

        assertEquals(34, endpoints.size());
        assertTrue(endpoints.containsAll(Arrays.asList(
                "POST /users/login", "GET /users/info", "GET /dishes",
                "GET /dishes/lite", "POST /recommend", "GET /recommend/single",
                "GET /recommend/options", "GET /users/preferences", "PUT /users/preferences",
                "POST /favorite-dishes/batch-check", "GET /recipe-records/statistics",
                "DELETE /recipe-records/date/{date}/meal/{mealType}",
                "GET /admin/users", "POST /chat", "POST /chat/sync"
        )));
    }

    private String endpoint(String base, Method method) {
        if (method.isAnnotationPresent(GetMapping.class)) return "GET " + base + path(method.getAnnotation(GetMapping.class).value());
        if (method.isAnnotationPresent(PostMapping.class)) return "POST " + base + path(method.getAnnotation(PostMapping.class).value());
        if (method.isAnnotationPresent(PutMapping.class)) return "PUT " + base + path(method.getAnnotation(PutMapping.class).value());
        if (method.isAnnotationPresent(DeleteMapping.class)) return "DELETE " + base + path(method.getAnnotation(DeleteMapping.class).value());
        return null;
    }

    private String path(String[] values) {
        return values.length == 0 ? "" : values[0];
    }
}
