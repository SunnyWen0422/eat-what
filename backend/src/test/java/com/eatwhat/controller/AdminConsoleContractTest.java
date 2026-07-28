package com.eatwhat.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminConsoleContractTest {
    @Test
    void adminControllerExposesCompleteWorkspaceContracts() {
        Set<String> endpoints = new HashSet<>();
        String base = AdminController.class.getAnnotation(RequestMapping.class).value()[0];
        for (Method method : AdminController.class.getDeclaredMethods()) {
            if (method.isAnnotationPresent(GetMapping.class)) {
                for (String path : method.getAnnotation(GetMapping.class).value()) endpoints.add("GET " + base + path);
            }
            if (method.isAnnotationPresent(PatchMapping.class)) {
                for (String path : method.getAnnotation(PatchMapping.class).value()) endpoints.add("PATCH " + base + path);
            }
            if (method.isAnnotationPresent(PutMapping.class)) {
                for (String path : method.getAnnotation(PutMapping.class).value()) endpoints.add("PUT " + base + path);
            }
        }
        assertTrue(endpoints.contains("GET /admin/overview"));
        assertTrue(endpoints.contains("GET /admin/dishes"));
        assertTrue(endpoints.contains("GET /admin/audit-logs"));
        assertTrue(endpoints.contains("PATCH /admin/users/{id}/status"));
        assertTrue(endpoints.contains("PATCH /admin/dishes/{id}/status"));
    }
}
