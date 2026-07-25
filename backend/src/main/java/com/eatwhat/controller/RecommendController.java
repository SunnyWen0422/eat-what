package com.eatwhat.controller;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.dto.RecommendationOptionsDTO;
import com.eatwhat.config.RecommendationFeatureProperties;
import com.eatwhat.entity.Dish;
import com.eatwhat.service.FavoriteDishService;
import com.eatwhat.service.RecipeRecordService;
import com.eatwhat.service.RecommendationMetadataService;
import com.eatwhat.service.RecommendationCriteriaResolver;
import com.eatwhat.service.RecommendationService;
import com.eatwhat.service.UserPreferenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final RecommendationService recommendationService;
    private final FavoriteDishService favoriteDishService;
    private final UserPreferenceService userPreferenceService;
    private final RecommendationMetadataService metadataService;
    private final RecipeRecordService recipeRecordService;
    private final RecommendationCriteriaResolver criteriaResolver = new RecommendationCriteriaResolver();
    private final RecommendationFeatureProperties featureProperties;

    public RecommendController(RecommendationService recommendationService,
                               FavoriteDishService favoriteDishService) {
        this(recommendationService, favoriteDishService, null, null, null, new RecommendationFeatureProperties(true));
    }

    @Autowired
    public RecommendController(RecommendationService recommendationService,
                               FavoriteDishService favoriteDishService,
                               UserPreferenceService userPreferenceService,
                               RecommendationMetadataService metadataService,
                               RecipeRecordService recipeRecordService,
                               RecommendationFeatureProperties featureProperties) {
        this.recommendationService = recommendationService;
        this.favoriteDishService = favoriteDishService;
        this.userPreferenceService = userPreferenceService;
        this.metadataService = metadataService;
        this.recipeRecordService = recipeRecordService;
        this.featureProperties = featureProperties;
    }

    public RecommendController(RecommendationService recommendationService,
                               FavoriteDishService favoriteDishService,
                               UserPreferenceService userPreferenceService,
                               RecommendationMetadataService metadataService,
                               RecipeRecordService recipeRecordService) {
        this(recommendationService, favoriteDishService, userPreferenceService, metadataService, recipeRecordService,
                new RecommendationFeatureProperties(true));
    }

    @GetMapping("/options")
    public ResponseEntity<?> options(HttpServletRequest request) {
        if (request.getAttribute("currentUserId") == null) return ResponseEntity.status(401).build();
        if (metadataService == null) return ResponseEntity.status(503).build();
        RecommendationOptionsDTO options = metadataService.getOptions();
        options.setPreferencesEnabled(featureProperties.isPreferencesEnabled());
        return ResponseEntity.ok(options);
    }

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

        if (featureProperties.isPreferencesEnabled() && metadataService != null) {
            Map<String, String> validationErrors = metadataService.validateCriteria(req == null ? null : req.getCriteria());
            if (!validationErrors.isEmpty()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("success", false);
                error.put("message", "Invalid recommendation criteria");
                error.put("errors", validationErrors);
                return ResponseEntity.badRequest().body(error);
            }
        }

        try {
            List<PlanDTO> plans;

            // 批量获取用户收藏的菜品ID，合并到响应中
            Long userId = Long.valueOf(currentUserId.toString());
            Set<Long> favoriteIds = new HashSet<>(favoriteDishService.getFavoriteDishIds(userId));
            boolean featureEnabled = featureProperties.isPreferencesEnabled();
            UserPreferenceDTO preferences = !featureEnabled || userPreferenceService == null ? new UserPreferenceDTO() : userPreferenceService.get(userId);
            boolean useSavedPreferences = featureEnabled && !Boolean.FALSE.equals(req.getUseSavedPreferences());
            EffectiveRecommendationCriteria appliedCriteria = criteriaResolver.resolve(featureEnabled ? req.getCriteria() : null, preferences, useSavedPreferences);
            Set<Long> recentIds = recipeRecordService == null
                    ? Collections.<Long>emptySet()
                    : recipeRecordService.getRecentDishIds(userId, appliedCriteria.getAvoidRecentDays());
            RecommendRequest effectiveRequest = featureEnabled ? req : legacyRequest(req);
            plans = recommendationService.generatePlans(effectiveRequest, preferences, favoriteIds, recentIds, userId);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("plans", plans);
            result.put("favoriteIds", favoriteIds);
            result.put("appliedCriteria", appliedCriteria);
            result.put("metadataVersion", metadataService == null ? 1 : metadataService.getMetadataVersion());
            result.put("preferenceVersion", preferences.getVersion());
            List<String> warnings = new ArrayList<>();
            List<String> selectedWarnings = featureEnabled
                    ? recommendationService.selectedDishWarnings(req, preferences, userId)
                    : Collections.<String>emptyList();
            if (selectedWarnings != null) warnings.addAll(selectedWarnings);
            warnings.addAll(buildWarnings(req, plans));
            result.put("warnings", warnings);
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
    private List<String> buildWarnings(RecommendRequest request, List<PlanDTO> plans) {
        if (plans == null || plans.isEmpty()) {
            return Collections.singletonList("没有菜品同时满足当前筛选条件，请减少一项筛选后重试。");
        }
        int requested = Math.max(0, request.getMeat() == null ? 2 : request.getMeat())
                + Math.max(0, request.getVeg() == null ? 2 : request.getVeg())
                + Math.max(0, request.getSoup() == null ? 1 : request.getSoup())
                + Math.max(0, request.getDessert() == null ? 0 : request.getDessert())
                + Math.max(0, request.getStaple() == null ? 0 : request.getStaple());
        for (PlanDTO plan : plans) {
            if (plan.getDishes() == null || plan.getDishes().size() < requested) {
                return Collections.singletonList("当前筛选下部分菜品类型数量不足，已返回可用菜品。");
            }
        }
        return Collections.emptyList();
    }

    private RecommendRequest legacyRequest(RecommendRequest source) {
        RecommendRequest result = new RecommendRequest();
        if (source == null) return result;
        result.setPeople(source.getPeople());
        result.setMeat(source.getMeat());
        result.setVeg(source.getVeg());
        result.setSoup(source.getSoup());
        result.setDessert(source.getDessert());
        result.setStaple(source.getStaple());
        result.setMealType(source.getMealType());
        result.setUserSelectedDishes(source.getUserSelectedDishes());
        result.setCriteria(new com.eatwhat.dto.RecommendationCriteria());
        result.setUseSavedPreferences(false);
        return result;
    }

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

            Dish dish = recommendationService.getSingleRecommendation(type, excludeIds);
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
