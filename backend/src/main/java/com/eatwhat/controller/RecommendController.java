package com.eatwhat.controller;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.service.DishService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 推荐控制器 - 直出生成菜谱推荐方案
 */
@RestController
@RequestMapping("/recommend")
public class RecommendController {

    @Autowired
    private DishService dishService;

    /**
     * 生成菜谱推荐方案
     * POST /api/recommend
     * 需要认证
     */
    @PostMapping
    public ResponseEntity<?> recommend(
            @RequestBody RecommendRequest req,
            HttpServletRequest request) {

        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            List<PlanDTO> plans = dishService.generateRecommendPlans(req);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("plans", plans);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }

    /**
     * 获取单道推荐菜品（从整体数据中随机抽取）
     * GET /api/recommend/single?type=meat&exclude=1,2,3
     * 需要认证
     */
    @GetMapping("/single")
    public ResponseEntity<?> recommendSingle(
            @RequestParam String type,
            @RequestParam(required = false) String exclude,
            HttpServletRequest request) {

        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            List<Long> excludeIds = new ArrayList<>();
            if (exclude != null && !exclude.isEmpty()) {
                for (String s : exclude.split(",")) {
                    s = s.trim();
                    if (!s.isEmpty()) {
                        excludeIds.add(Long.parseLong(s));
                    }
                }
            }

            Dish dish = dishService.getSingleRecommendation(type, excludeIds);
            if (dish == null) {
                Map<String, Object> empty = new HashMap<>();
                empty.put("success", false);
                empty.put("message", "没有找到符合条件的菜品");
                return ResponseEntity.ok(empty);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("dish", dish);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
}
