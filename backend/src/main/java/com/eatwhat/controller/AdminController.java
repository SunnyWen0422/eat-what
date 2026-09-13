package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.entity.User;
import com.eatwhat.service.AdminAuthorizationService;
import com.eatwhat.service.AdminAuditService;
import com.eatwhat.service.AdminDishService;
import com.eatwhat.service.AdminOverviewService;
import com.eatwhat.service.AdminUserService;
import com.eatwhat.service.CustomDishService;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
    private final AdminOverviewService adminOverviewService;
    private final AdminDishService adminDishService;
    private final AdminAuditService adminAuditService;

    public AdminController(AdminUserService adminUserService,
                           CustomDishService customDishService,
                           AdminAuthorizationService adminAuthorizationService) {
        this(adminUserService, customDishService, adminAuthorizationService, null, null, null);
    }

    @Autowired
    public AdminController(AdminUserService adminUserService,
                           CustomDishService customDishService,
                           AdminAuthorizationService adminAuthorizationService,
                           AdminOverviewService adminOverviewService,
                           AdminDishService adminDishService,
                           AdminAuditService adminAuditService) {
        this.adminUserService = adminUserService;
        this.customDishService = customDishService;
        this.adminAuthorizationService = adminAuthorizationService;
        this.adminOverviewService = adminOverviewService;
        this.adminDishService = adminDishService;
        this.adminAuditService = adminAuditService;
    }

    @GetMapping("/overview")
    public ResponseEntity<?> overview(HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        return ResponseEntity.ok(adminOverviewService.getOverview());
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

    @PatchMapping("/users/{id}/status")
    public ResponseEntity<?> updateUserStatus(@PathVariable Long id,
                                               @RequestBody Map<String, Object> body,
                                               HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        Integer status = integerValue(body == null ? null : body.get("status"));
        try {
            User updated = adminUserService.updateStatus(id, status);
            if (updated == null) return notFound("user not found");
            audit(request, id, null, "USER_STATUS_UPDATE", "SUCCESS", "status", status);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("user", safeUser(updated));
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            audit(request, id, null, "USER_STATUS_UPDATE", "REJECTED", "reason", e.getMessage());
            return badRequest(e.getMessage());
        } catch (IllegalStateException e) {
            audit(request, id, null, "USER_STATUS_UPDATE", "REJECTED", "reason", e.getMessage());
            return ResponseEntity.status(409).body(message(e.getMessage()));
        }
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

        try {
            Dish created = customDishService.createDish(id, dish);
            audit(request, id, created.getId(), "CUSTOM_DISH_CREATE", "SUCCESS", "dishName", created.getName());

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("dish", created);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            audit(request, id, null, "CUSTOM_DISH_CREATE", "REJECTED", "reason", e.getMessage());
            return badRequest(e.getMessage());
        }
    }

    @DeleteMapping("/users/{userId}/dishes/{dishId}")
    public ResponseEntity<?> deleteDish(
            @PathVariable Long userId,
            @PathVariable Long dishId,
            HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;

        boolean removed = customDishService.removeCustomDish(userId, dishId);
        audit(request, userId, dishId, "CUSTOM_DISH_DELETE", removed ? "SUCCESS" : "REJECTED",
                removed ? "scope" : "reason", removed ? "custom" : "dish not found or not owned by user");
        Map<String, Object> result = new HashMap<>();
        result.put("success", removed);
        result.put("message", removed ? "deleted" : "dish not found or not owned by user");
        return removed ? ResponseEntity.ok(result) : ResponseEntity.status(404).body(result);
    }

    @PutMapping("/users/{userId}/dishes/{dishId}")
    public ResponseEntity<?> updateUserDish(@PathVariable Long userId,
                                            @PathVariable Long dishId,
                                            @RequestBody Dish dish,
                                            HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        if (adminUserService.findUser(userId) == null) return notFound("user not found");
        try {
            Dish updated = customDishService.updateDish(userId, dishId, dish);
            if (updated == null) {
                audit(request, userId, dishId, "CUSTOM_DISH_UPDATE", "REJECTED", "reason", "dish not found or not owned by user");
                return notFound("dish not found or not owned by user");
            }
            audit(request, userId, dishId, "CUSTOM_DISH_UPDATE", "SUCCESS", "dishName", updated.getName());
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            audit(request, userId, dishId, "CUSTOM_DISH_UPDATE", "REJECTED", "reason", e.getMessage());
            return badRequest(e.getMessage());
        }
    }

    @GetMapping("/dishes")
    public ResponseEntity<?> listDishes(@RequestParam(required = false) String scope,
                                        @RequestParam(required = false) String keyword,
                                        @RequestParam(required = false) String type,
                                        @RequestParam(required = false) Integer published,
                                        @RequestParam(required = false) Long ownerId,
                                        @RequestParam(defaultValue = "1") Integer page,
                                        @RequestParam(defaultValue = "20") Integer pageSize,
                                        HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        try {
            return ResponseEntity.ok(adminDishService.list(scope, keyword, type, published, ownerId, page, pageSize));
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        }
    }

    @GetMapping("/dishes/{id}")
    public ResponseEntity<?> dishDetail(@PathVariable Long id, HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        Dish dish = adminDishService.get(id);
        return dish == null ? notFound("dish not found") : ResponseEntity.ok(dish);
    }

    @PutMapping("/dishes/{id}")
    public ResponseEntity<?> updateSystemDish(@PathVariable Long id,
                                              @RequestBody Dish dish,
                                              HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        if (dish == null) return badRequest("dish body is required");
        dish.setId(id);
        try {
            Dish updated = adminDishService.updateSystem(dish);
            if (updated == null) return notFound("system dish not found");
            audit(request, null, id, "SYSTEM_DISH_UPDATE", "SUCCESS", "dishName", updated.getName());
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            audit(request, null, id, "SYSTEM_DISH_UPDATE", "REJECTED", "reason", e.getMessage());
            return badRequest(e.getMessage());
        }
    }

    @PatchMapping("/dishes/{id}/status")
    public ResponseEntity<?> updateDishStatus(@PathVariable Long id,
                                              @RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        Integer published = integerValue(body == null ? null : body.get("published"));
        if (published == null && body != null) published = integerValue(body.get("isPublished"));
        try {
            Dish updated = adminDishService.updatePublication(id, published);
            if (updated == null) return notFound("system dish not found");
            audit(request, null, id, "SYSTEM_DISH_PUBLICATION", "SUCCESS", "status", published);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            audit(request, null, id, "SYSTEM_DISH_PUBLICATION", "REJECTED", "reason", e.getMessage());
            return badRequest(e.getMessage());
        } catch (IllegalStateException e) {
            audit(request, null, id, "SYSTEM_DISH_PUBLICATION", "REJECTED", "reason", e.getMessage());
            return ResponseEntity.status(409).body(message(e.getMessage()));
        }
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<?> auditLogs(@RequestParam(required = false) Long adminId,
                                       @RequestParam(required = false) Long targetUserId,
                                       @RequestParam(required = false) String action,
                                       @RequestParam(required = false) String from,
                                       @RequestParam(required = false) String to,
                                       @RequestParam(defaultValue = "1") Integer page,
                                       @RequestParam(defaultValue = "20") Integer pageSize,
                                       HttpServletRequest request) {
        ResponseEntity<?> denied = authorize(request);
        if (denied != null) return denied;
        try {
            return ResponseEntity.ok(adminAuditService.search(adminId, targetUserId, action, from, to, page, pageSize));
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        }
    }

    private ResponseEntity<?> authorize(HttpServletRequest request) {
        Long value = currentUserId(request);
        if (value == null) return ResponseEntity.status(401).build();
        if (!adminAuthorizationService.isAdmin(value)) return ResponseEntity.status(403).build();
        return null;
    }

    private Long currentUserId(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        if (value instanceof Number) return ((Number) value).longValue();
        if (value == null) return null;
        try {
            return Long.valueOf(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private Integer integerValue(Object value) {
        if (value instanceof Number) return ((Number) value).intValue();
        if (value == null) return null;
        try {
            return Integer.valueOf(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private void audit(HttpServletRequest request, Long targetUserId, Long targetDishId,
                       String action, String result, String detailKey, Object detailValue) {
        if (adminAuditService == null) return;
        adminAuditService.record(currentUserId(request), targetUserId, targetDishId, action, result,
                detailKey, detailValue, request.getHeader("X-Request-Id"));
    }

    private ResponseEntity<Map<String, Object>> badRequest(String message) {
        return ResponseEntity.badRequest().body(message(message));
    }

    private ResponseEntity<Map<String, Object>> notFound(String message) {
        return ResponseEntity.status(404).body(message(message));
    }

    private Map<String, Object> message(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", false);
        result.put("message", message);
        return result;
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
