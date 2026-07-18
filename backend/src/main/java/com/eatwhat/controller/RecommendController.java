package com.eatwhat.controller;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.service.DishService;
import com.eatwhat.service.FavoriteDishService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 推荐控制器 - 直出生成菜谱推荐方案
 */
@RestController
@RequestMapping("/recommend")
public class RecommendController {

    private static final Logger log = LoggerFactory.getLogger(RecommendController.class);

    @Autowired
    private DishService dishService;

    @Autowired
    private FavoriteDishService favoriteDishService;

    /**
     * 生成菜谱推荐方案（含收藏状态，前端无需二次请求）
     * POST /api/recommend
     */
    @PostMapping
    public ResponseEntity<?> recommend(
            @RequestBody RecommendRequest req,
            HttpServletRequest request) {

        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            List<PlanDTO> plans = dishService.generateRecommendPlans(req);

            // 批量获取用户收藏的菜品ID，合并到响应中
            Long userId = Long.valueOf(currentUserId.toString());
            Set<Long> favoriteIds = new HashSet<>(favoriteDishService.getFavoriteDishIds(userId));

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("plans", plans);
            result.put("favoriteIds", favoriteIds);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Recommend failed, request={}", req, e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }

    /**
     * 获取单道推荐菜品（从整体数据中随机抽取）
     * GET /api/recommend/single?type=meat&exclude=1,2,3
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
                    if (!s.isEmpty()) excludeIds.add(Long.parseLong(s));
                }
            }

            Dish dish = dishService.getSingleRecommendation(type, excludeIds);
            if (dish == null) {
                Map<String, Object> empty = new HashMap<>();
                empty.put("success", false);
                empty.put("message", "没有找到符合条件的菜品");
                return ResponseEntity.ok(empty);
            }

            // 检查收藏状态
            Long userId = Long.valueOf(currentUserId.toString());
            boolean isFavorite = favoriteDishService.isFavorite(userId, dish.getId());

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("dish", dish);
            result.put("isFavorite", isFavorite);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Single recommendation failed, type={}, exclude={}", type, exclude, e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
}
