package com.eatwhat.controller;

import com.eatwhat.entity.User;
import com.eatwhat.service.UserService;
import com.eatwhat.util.TokenUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 用户控制器
 */
@RestController
@RequestMapping("/users")
public class UserController {
    
    @Autowired
    private UserService userService;
    
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
            result.put("success", true);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            // 打印详细错误到控制台
            e.printStackTrace();
            return ResponseEntity.status(500).body(error);
        }
    }
    
    /**
     * 获取当前用户信息
     * GET /api/users/info
     * @param token token（从请求头或参数中获取）
     * @return 用户信息
     */
    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> getUserInfo(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(value = "token", required = false) String tokenParam) {
        
        // 从请求头或参数中获取token
        String token = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (tokenParam != null) {
            token = tokenParam;
        }
        
        if (token == null || token.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "未提供token");
            return ResponseEntity.status(401).body(error);
        }
        
        Long userId = TokenUtil.getUserIdFromToken(token);
        if (userId == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "token无效或已过期");
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
        return ResponseEntity.ok(result);
    }
    
    /**
     * 更新用户信息
     * PUT /api/users/info
     * @param user 用户信息（昵称、头像等）
     * @param authHeader 请求头中的token
     * @param tokenParam 参数中的token
     * @return 更新后的用户信息
     */
    @PutMapping("/info")
    public ResponseEntity<Map<String, Object>> updateUserInfo(
            @RequestBody User user,
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(value = "token", required = false) String tokenParam) {
        
        // 从请求头或参数中获取token
        String token = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (tokenParam != null) {
            token = tokenParam;
        }
        
        if (token == null || token.isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "未提供token");
            return ResponseEntity.status(401).body(error);
        }
        
        Long userId = TokenUtil.getUserIdFromToken(token);
        if (userId == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "token无效或已过期");
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
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "更新失败: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
}
