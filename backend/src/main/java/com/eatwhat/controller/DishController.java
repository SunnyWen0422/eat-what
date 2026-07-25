package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.service.CustomDishService;
import com.eatwhat.service.DishQueryService;
import com.eatwhat.service.RecommendationMetadataService;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 菜品控制器
 */
@RestController
@RequestMapping("/dishes")
public class DishController {

    private final DishQueryService dishQueryService;
    private final CustomDishService customDishService;
    private final RecommendationMetadataService metadataService;

    public DishController(DishQueryService dishQueryService, CustomDishService customDishService) {
        this(dishQueryService, customDishService, null);
    }

    @Autowired
    public DishController(DishQueryService dishQueryService,
                          CustomDishService customDishService,
                          RecommendationMetadataService metadataService) {
        this.dishQueryService = dishQueryService;
        this.customDishService = customDishService;
        this.metadataService = metadataService;
    }
    
    /**
     * 获取菜品列表（分页）
     * GET /api/dishes?type=meat&page=1&pageSize=50
     * 需要认证
     */
    @GetMapping
    public ResponseEntity<?> getDishes(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String cuisineCodes,
            @RequestParam(required = false) String tagCodes,
            @RequestParam(required = false) String methodCodes,
            @RequestParam(required = false) String excludeTagCodes,
            @RequestParam(required = false) String excludedIngredients,
            @RequestParam(required = false) Integer maxCookMinutes,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            HttpServletRequest request) {

        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setCuisineCodes(parseCodes(cuisineCodes));
        List<String> wantedTags = parseCodes(tagCodes);
        wantedTags.addAll(parseCodes(methodCodes));
        criteria.setIncludeTagCodes(new ArrayList<>(new java.util.LinkedHashSet<>(wantedTags)));
        criteria.setExcludeTagCodes(parseCodes(excludeTagCodes));
        criteria.setExcludedIngredients(parseText(excludedIngredients));
        criteria.setMaxCookMinutes(maxCookMinutes);

        Map<String, String> errors = validateCriteria(criteria);
        if (!errors.isEmpty()) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("message", "Invalid dish filter criteria");
            error.put("errors", errors);
            return ResponseEntity.badRequest().body(error);
        }

        Long userId = Long.valueOf(currentUserId.toString());
        DishPageDTO result = dishQueryService.getFilteredDishes(userId, type, keyword, criteria, page, pageSize);
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
        
        List<Dish> dishes = dishQueryService.searchDishes(keyword, type);
        return ResponseEntity.ok(dishes);
    }
    
    /**
     * 创建自定义菜品
     * POST /api/dishes/custom
     */
    @PostMapping("/custom")
    public ResponseEntity<Dish> createCustomDish(@RequestBody Dish dish, HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (!(currentUserId instanceof Long)) {
            return ResponseEntity.status(401).build();
        }
        Dish created = customDishService.createDish((Long) currentUserId, dish);
        return ResponseEntity.ok(created);
    }

    /**
     * GET /api/dishes/custom
     */
    @GetMapping("/custom")
    public ResponseEntity<List<Dish>> getCustomDishes(HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (!(currentUserId instanceof Long)) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(customDishService.getCustomDishes((Long) currentUserId));
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
        
        Dish dish = dishQueryService.getDishById(id, Long.valueOf(currentUserId.toString()));
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
        int count = dishQueryService.getDishCount();
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

        List<Dish> dishes = dishQueryService.getDishesLite(type, keyword, limit);
        return ResponseEntity.ok(dishes);
    }

    private List<String> parseCodes(String value) {
        if (value == null || value.trim().isEmpty()) return new ArrayList<>();
        List<String> result = new ArrayList<>();
        for (String item : value.split(",")) {
            String code = item.trim().toUpperCase();
            if (!code.isEmpty() && !result.contains(code)) result.add(code);
        }
        return result;
    }

    private List<String> parseText(String value) {
        if (value == null || value.trim().isEmpty()) return new ArrayList<>();
        List<String> result = new ArrayList<>();
        for (String item : value.split(",")) {
            String text = item.trim();
            if (!text.isEmpty() && !result.contains(text)) result.add(text);
        }
        return result;
    }

    private Map<String, String> validateCriteria(RecommendationCriteria criteria) {
        Map<String, String> errors = metadataService == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(metadataService.validateCriteria(criteria));
        if (criteria.getMaxCookMinutes() != null
                && (criteria.getMaxCookMinutes() <= 0 || criteria.getMaxCookMinutes() > 240)) {
            errors.put("maxCookMinutes", "Must be between 1 and 240");
        }
        return errors;
    }
}

