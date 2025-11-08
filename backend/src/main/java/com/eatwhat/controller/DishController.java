package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.service.DishService;
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
     * 获取所有菜品
     * GET /api/dishes?type=meat&keyword=鸡&userId=1
     */
    @GetMapping
    public ResponseEntity<List<Dish>> getDishes(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId) {
        
        List<Dish> dishes = dishService.getDishes(type, keyword, userId);
        return ResponseEntity.ok(dishes);
    }
    
    /**
     * 搜索菜品
     * GET /api/dishes/search?keyword=鸡&type=meat
     */
    @GetMapping("/search")
    public ResponseEntity<List<Dish>> searchDishes(
            @RequestParam String keyword,
            @RequestParam(required = false) String type) {
        
        List<Dish> dishes = dishService.searchDishes(keyword, type);
        return ResponseEntity.ok(dishes);
    }
    
    /**
     * 创建自定义菜品
     * POST /api/dishes/custom
     */
    @PostMapping("/custom")
    public ResponseEntity<Dish> createCustomDish(@RequestBody Dish dish) {
        // TODO: 从session或token获取userId
        // 现在暂时使用传入的userId或设为1
        if (dish.getUserId() == null) {
            dish.setUserId(1L);
        }
        
        Dish created = dishService.createDish(dish);
        return ResponseEntity.ok(created);
    }
    
    /**
     * 根据ID获取菜品
     * GET /api/dishes/{id}
     */
    @GetMapping("/{id}")
    public ResponseEntity<Dish> getDishById(@PathVariable Long id) {
        Dish dish = dishService.getDishById(id);
        if (dish == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dish);
    }
}

