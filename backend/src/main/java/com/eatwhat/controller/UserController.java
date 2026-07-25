package com.eatwhat.controller;

import com.eatwhat.entity.User;
import com.eatwhat.service.AdminAuthorizationService;
import com.eatwhat.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;

/**
 * 用户控制器
 */
@RestController
@RequestMapping("/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);
    
    private final UserService userService;
    private final AdminAuthorizationService adminAuthorizationService;

    public UserController(UserService userService, AdminAuthorizationService adminAuthorizationService) {
        this.userService = userService;
        this.adminAuthorizationService = adminAuthorizationService;
    }
    
    /**
     * 用户登录接口
     * POST /api/users/login
     * @param requestBody 包含 code 的请求体
     * @return 包含 token 和 user 的响应
     */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> requestBody) {
        String code = requestBody.get("code");
        
        if (code == null || code.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "code不能为空");
            return ResponseEntity.badRequest().body(error);
        }
        
        try {
            Map<String, Object> result = userService.loginByCode(code);
            User user = (User) result.get("user");
            result.put("isAdmin", user != null && adminAuthorizationService.isAdmin(user.getId()));
            result.put("success", true);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("WeChat login failed", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }

    /**
     * Phone login is deprecated in the current client flow.
     * Keep the route explicit so callers get a business-level response.
     */
    @PostMapping("/phone-login")
    public ResponseEntity<Map<String, Object>> phoneLogin() {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        result.put("message", "phone-login is deprecated");
        return ResponseEntity.status(410).body(result);
    }
    
    /**
     * 获取当前用户信息
     * GET /api/users/info
     * @param request 认证拦截器已写入当前用户ID的请求
     * @return 用户信息
     */
    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> getUserInfo(HttpServletRequest request) {
        Long userId = currentUserId(request);
        if (userId == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "未提供token");
            return ResponseEntity.status(401).body(error);
        }
        
        User user = userService.getUserById(userId);
        if (user == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "用户不存在");
            return ResponseEntity.status(404).body(error);
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("user", user);
        result.put("isAdmin", adminAuthorizationService.isAdmin(userId));
        return ResponseEntity.ok(result);
    }
    
    /**
     * 更新用户信息
     * PUT /api/users/info
     * @param user 用户信息（昵称、头像等）
     * @param request 认证拦截器已写入当前用户ID的请求
     * @return 更新后的用户信息
     */
    @PutMapping("/info")
    public ResponseEntity<Map<String, Object>> updateUserInfo(
            @RequestBody User user,
            HttpServletRequest request) {
        Long userId = currentUserId(request);
        if (userId == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "未提供token");
            return ResponseEntity.status(401).body(error);
        }
        
        // 确保只能更新自己的信息
        user.setId(userId);
        
        try {
            User updatedUser = userService.updateUserInfo(user);
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("user", updatedUser);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Update user info failed, userId={}", userId, e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "更新失败: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }

    private Long currentUserId(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        return value instanceof Long ? (Long) value : null;
    }
}
