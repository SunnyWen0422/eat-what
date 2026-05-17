package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.service.DishService;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * 菜品控制器
 */
@RestController
@RequestMapping("/dishes")
public class DishController {
    
    @Autowired
    private DishService dishService;
    
    /**
     * 获取菜品列表（分页）
     * GET /api/dishes?type=meat&page=1&pageSize=50
     * 需要认证
     */
    @GetMapping
    public ResponseEntity<?> getDishes(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            HttpServletRequest request) {

        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        List<Dish> dishes = dishService.getDishes(type, keyword, page, pageSize);
        int total = 0;
        if (type != null && !type.isEmpty()) {
            total = dishService.getDishesCountByType(type);
        }

        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("list", dishes);
        result.put("total", total);
        result.put("page", page);
        result.put("pageSize", pageSize);
        return ResponseEntity.ok(result);
    }
    
    /**
     * 搜索菜品
     * GET /api/dishes/search?keyword=鸡&type=meat
     * 需要认证
     */
    @GetMapping("/search")
    public ResponseEntity<List<Dish>> searchDishes(
            @RequestParam String keyword,
            @RequestParam(required = false) String type,
            HttpServletRequest request) {
        
        // 验证用户是否已登录
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        
        List<Dish> dishes = dishService.searchDishes(keyword, type);
        return ResponseEntity.ok(dishes);
    }
    
    /**
     * 创建自定义菜品
     * POST /api/dishes/custom
     */
    @PostMapping("/custom")
    public ResponseEntity<Dish> createCustomDish(@RequestBody Dish dish, HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId instanceof Long) {
            dish.setUserId((Long) currentUserId);
        }

        Dish created = dishService.createDish(dish);
        return ResponseEntity.ok(created);
    }
    
    /**
     * 根据ID获取菜品
     * GET /api/dishes/{id}
     * 需要认证
     */
    @GetMapping("/{id}")
    public ResponseEntity<Dish> getDishById(@PathVariable Long id, HttpServletRequest request) {
        // 验证用户是否已登录
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        
        Dish dish = dishService.getDishById(id);
        if (dish == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dish);
    }

    /**
     * 获取菜品总数
     * GET /api/dishes/count
     */
    @GetMapping("/count")
    public ResponseEntity<Integer> getDishCount() {
        int count = dishService.getDishCount();
        return ResponseEntity.ok(count);
    }

    /**
     * 获取所有菜品（轻量版 - 只返回推荐所需的必要字段）
     * GET /api/dishes/lite?type=meat&keyword=鸡&limit=100
     * 用于前端推荐算法，大幅减少数据传输量
     * 需要认证
     */
    @GetMapping("/lite")
    public ResponseEntity<List<Dish>> getDishesLite(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "2147483647") int limit,
            HttpServletRequest request) {

        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        List<Dish> dishes = dishService.getDishesLite(type, keyword, limit);
        return ResponseEntity.ok(dishes);
    }
}

