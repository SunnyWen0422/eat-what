package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.entity.User;
import com.eatwhat.mapper.UserMapper;
import com.eatwhat.service.DishService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin")
public class AdminController {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private DishService dishService;

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(HttpServletRequest request) {
        if (request.getAttribute("currentUserId") == null) {
            return ResponseEntity.status(401).build();
        }

        List<User> users = userMapper.selectAll();
        List<Map<String, Object>> data = new ArrayList<>();
        if (users != null) {
            for (User user : users) {
                Map<String, Object> item = new HashMap<>();
                item.put("id", user.getId());
                item.put("nickname", user.getNickname());
                item.put("phone", user.getPhone());
                item.put("status", user.getStatus());
                item.put("registerTime", user.getRegisterTime());
                item.put("customCount", dishService.getCustomDishes(user.getId()).size());
                data.add(item);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("data", data);
        result.put("total", data.size());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<?> userDetail(@PathVariable Long id, HttpServletRequest request) {
        if (request.getAttribute("currentUserId") == null) {
            return ResponseEntity.status(401).build();
        }

        User user = userMapper.selectById(id);
        if (user == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("message", "user not found");
            return ResponseEntity.status(404).body(result);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("user", user);
        result.put("customDishes", dishService.getCustomDishes(id));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/users/{id}/dishes")
    public ResponseEntity<?> addDish(@PathVariable Long id, @RequestBody Dish dish, HttpServletRequest request) {
        if (request.getAttribute("currentUserId") == null) {
            return ResponseEntity.status(401).build();
        }

        dish.setUserId(id);
        dish.setIsCustom(1);
        Dish created = dishService.createDish(dish);

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
        if (request.getAttribute("currentUserId") == null) {
            return ResponseEntity.status(401).build();
        }

        boolean removed = dishService.removeCustomDish(userId, dishId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", removed);
        result.put("message", removed ? "deleted" : "dish not found or not owned by user");
        return removed ? ResponseEntity.ok(result) : ResponseEntity.status(404).body(result);
    }
}
