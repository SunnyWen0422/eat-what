package com.eatwhat.controller;

import com.eatwhat.entity.FavoriteDish;
import com.eatwhat.service.FavoriteDishService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 收藏菜品控制器
 */
@RestController
@RequestMapping("/favorite-dishes")
public class FavoriteDishController {

    private static final Logger logger = LoggerFactory.getLogger(FavoriteDishController.class);

    @Autowired
    private FavoriteDishService favoriteDishService;

    /**
     * 添加收藏
     * POST /api/favorite-dishes
     */
    @PostMapping
    public ResponseEntity<?> addFavorite(@RequestBody Map<String, Long> request, HttpServletRequest httpRequest) {
        logger.info("【添加收藏】开始处理添加收藏请求");
        Object currentUserId = httpRequest.getAttribute("currentUserId");
        if (currentUserId == null) {
            logger.warn("【添加收藏】用户未登录");
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "用户未登录"));
        }
        logger.info("【添加收藏】用户ID: {}", currentUserId);

        Long dishId = request.get("dishId");
        if (dishId == null) {
            logger.warn("【添加收藏】dishId为空");
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "dishId不能为空"));
        }
        logger.info("【添加收藏】菜品ID: {}", dishId);

        try {
            boolean success = favoriteDishService.addFavorite((Long) currentUserId, dishId);
            logger.info("【添加收藏】操作结果: {}", success);
            if (success) {
                return ResponseEntity.ok(Collections.singletonMap("success", true));
            } else {
                return ResponseEntity.ok(Collections.singletonMap("success", false));
            }
        } catch (Exception e) {
            logger.error("【添加收藏】操作失败", e);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "添加收藏失败: " + e.getMessage()));
        }
    }

    /**
     * 取消收藏
     * DELETE /api/favorite-dishes/{dishId}
     */
    @DeleteMapping("/{dishId}")
    public ResponseEntity<?> removeFavorite(@PathVariable Long dishId, HttpServletRequest request) {
        logger.info("【取消收藏】开始处理取消收藏请求, 菜品ID: {}", dishId);
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            logger.warn("【取消收藏】用户未登录");
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "用户未登录"));
        }
        logger.info("【取消收藏】用户ID: {}", currentUserId);

        try {
            boolean success = favoriteDishService.removeFavorite((Long) currentUserId, dishId);
            logger.info("【取消收藏】操作结果: {}", success);
            if (success) {
                return ResponseEntity.ok(Collections.singletonMap("success", true));
            } else {
                return ResponseEntity.ok(Collections.singletonMap("success", false));
            }
        } catch (Exception e) {
            logger.error("【取消收藏】操作失败", e);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "取消收藏失败: " + e.getMessage()));
        }
    }

    /**
     * 检查是否已收藏
     * GET /api/favorite-dishes/check?dishId=1
     */
    @GetMapping("/check")
    public ResponseEntity<?> checkFavorite(@RequestParam Long dishId, HttpServletRequest request) {
        logger.info("【检查收藏】开始处理检查收藏请求, 菜品ID: {}", dishId);
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            logger.warn("【检查收藏】用户未登录");
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "用户未登录"));
        }

        try {
            boolean isFavorite = favoriteDishService.isFavorite((Long) currentUserId, dishId);
            logger.info("【检查收藏】检查结果: {}", isFavorite);
            return ResponseEntity.ok(Collections.singletonMap("isFavorite", isFavorite));
        } catch (Exception e) {
            logger.error("【检查收藏】操作失败", e);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "检查收藏失败: " + e.getMessage()));
        }
    }

    /**
     * 批量检查收藏状态
     * POST /api/favorite-dishes/batch-check
     */
    @PostMapping("/batch-check")
    public ResponseEntity<?> batchCheckFavorite(@RequestBody List<Long> dishIds, HttpServletRequest request) {
        logger.info("【批量检查收藏】开始处理批量检查请求, 菜品IDs: {}", dishIds);
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            logger.warn("【批量检查收藏】用户未登录");
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "用户未登录"));
        }
        logger.info("【批量检查收藏】用户ID: {}", currentUserId);

        try {
            List<Long> favoriteIds = favoriteDishService.getFavoriteDishIds((Long) currentUserId);
            logger.info("【批量检查收藏】收藏的菜品IDs: {}", favoriteIds);
            return ResponseEntity.ok(favoriteIds);
        } catch (Exception e) {
            logger.error("【批量检查收藏】操作失败", e);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "批量检查失败: " + e.getMessage()));
        }
    }

    /**
     * 获取用户的收藏列表
     * GET /api/favorite-dishes
     */
    @GetMapping
    public ResponseEntity<?> getFavorites(HttpServletRequest request) {
        logger.info("【获取收藏列表】开始处理获取收藏列表请求");
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            logger.warn("【获取收藏列表】用户未登录");
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "用户未登录"));
        }
        logger.info("【获取收藏列表】用户ID: {}", currentUserId);

        try {
            List<FavoriteDish> favorites = favoriteDishService.getFavorites((Long) currentUserId);
            logger.info("【获取收藏列表】收藏数量: {}", favorites.size());
            return ResponseEntity.ok(favorites);
        } catch (Exception e) {
            logger.error("【获取收藏列表】操作失败", e);
            return ResponseEntity.status(500).body(Collections.singletonMap("error", "获取收藏列表失败: " + e.getMessage()));
        }
    }
}
