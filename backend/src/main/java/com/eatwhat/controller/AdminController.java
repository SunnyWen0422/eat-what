package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.entity.User;
import com.eatwhat.service.AdminAuthorizationService;
import com.eatwhat.service.AdminUserService;
import com.eatwhat.service.CustomDishService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private final AdminUserService adminUserService;
    private final CustomDishService customDishService;
    private final AdminAuthorizationService adminAuthorizationService;

    public AdminController(AdminUserService adminUserService,
                           CustomDishService customDishService,
                           AdminAuthorizationService adminAuthorizationService) {
        this.adminUserService = adminUserService;
        this.customDishService = customDishService;
        this.adminAuthorizationService = adminAuthorizationService;
    }

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer pageSize,
            HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        return ResponseEntity.ok(adminUserService.listUsers(keyword, page, pageSize));
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<?> userDetail(@PathVariable Long id, HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;

        User user = adminUserService.findUser(id);
        if (user == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("message", "user not found");
            return ResponseEntity.status(404).body(result);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("user", safeUser(user));
        result.put("customDishes", customDishService.getCustomDishes(id));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/users/{id}/dishes")
    public ResponseEntity<?> addDish(@PathVariable Long id, @RequestBody Dish dish, HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;

        if (adminUserService.findUser(id) == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("message", "user not found");
            return ResponseEntity.status(404).body(result);
        }

        Dish created = customDishService.createDish(id, dish);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("dish", created);
        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/users/{userId}/dishes/{dishId}")
    public ResponseEntity<?> deleteDish(
            @PathVariable Long userId,
            @PathVariable Long dishId,
            HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;

        boolean removed = customDishService.removeCustomDish(userId, dishId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", removed);
        result.put("message", removed ? "deleted" : "dish not found or not owned by user");
        return removed ? ResponseEntity.ok(result) : ResponseEntity.status(404).body(result);
    }

    private ResponseEntity<?> authorize(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        if (!(value instanceof Long)) return ResponseEntity.status(401).build();
        if (!adminAuthorizationService.isAdmin((Long) value)) return ResponseEntity.status(403).build();
        return null;
    }

    private Map<String, Object> safeUser(User user) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", user.getId());
        value.put("nickname", user.getNickname());
        value.put("avatar", user.getAvatar());
        value.put("phone", user.getPhone());
        value.put("status", user.getStatus());
        value.put("registerTime", user.getRegisterTime());
        value.put("lastLoginTime", user.getLastLoginTime());
        return value;
    }
}
