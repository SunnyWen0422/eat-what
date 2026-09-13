package com.eatwhat.service;

import com.eatwhat.dto.ShoppingBatchAddRequest;
import com.eatwhat.dto.ShoppingClearRequest;
import com.eatwhat.dto.ShoppingDishDTO;
import com.eatwhat.dto.ShoppingDishRequest;
import com.eatwhat.dto.ShoppingItemPatchRequest;
import com.eatwhat.dto.ShoppingPreviewItemDTO;
import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.dto.ShoppingPreviewResponse;
import com.eatwhat.dto.ShoppingListResponse;
import com.eatwhat.entity.RecipeRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Executes only actions already approved by the Python Agent preview.  The
 * model never receives this service or a database connection.
 */
@Service
public class AssistantActionService {
    private final RecipeRecordService recipeRecordService;
    private final ShoppingPreviewService shoppingPreviewService;
    private final ShoppingListService shoppingListService;
    private final ObjectMapper objectMapper;
    private final Map<String, Map<String, Object>> idempotentResults = new ConcurrentHashMap<>();

    public AssistantActionService(RecipeRecordService recipeRecordService,
                                  ShoppingPreviewService shoppingPreviewService,
                                  ShoppingListService shoppingListService,
                                  ObjectMapper objectMapper) {
        this.recipeRecordService = recipeRecordService;
        this.shoppingPreviewService = shoppingPreviewService;
        this.shoppingListService = shoppingListService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> execute(Long userId, Map<String, Object> approvedAction) {
        if (userId == null) throw new IllegalArgumentException("用户未登录");
        if (approvedAction == null) throw new IllegalArgumentException("确认动作不能为空");
        String actionType = String.valueOf(approvedAction.get("type"));
        String requestKey = String.valueOf(approvedAction.get("idempotency_key"));
        if (requestKey.trim().isEmpty() || "null".equalsIgnoreCase(requestKey)) {
            throw new IllegalArgumentException("幂等键不能为空");
        }
        String previewToken = String.valueOf(approvedAction.get("preview_token"));
        if (previewToken.trim().isEmpty() || "null".equalsIgnoreCase(previewToken)) {
            throw new IllegalArgumentException("预览凭证不能为空");
        }
        String key = userId + ":" + actionType + ":" + requestKey;
        Map<String, Object> prior = idempotentResults.get(key);
        if (prior != null) return prior;
        @SuppressWarnings("unchecked")
        Map<String, Object> plan = approvedAction.get("plan") instanceof Map
                ? (Map<String, Object>) approvedAction.get("plan") : Collections.emptyMap();
        Map<String, Object> result;
        switch (actionType) {
            case "SAVE_CALENDAR":
            case "CREATE_CALENDAR":
                result = saveCalendar(userId, plan, false);
                break;
            case "UPDATE_CALENDAR":
                result = saveCalendar(userId, plan, true);
                break;
            case "DELETE_CALENDAR":
                result = deleteCalendar(userId, plan);
                break;
            case "ADD_SHOPPING_LIST":
                result = addShopping(userId, plan, requestKey, approvedAction.get("payload"));
                break;
            case "UPDATE_SHOPPING_LIST":
                result = updateShopping(userId, approvedAction.get("payload"));
                break;
            case "DELETE_SHOPPING_LIST":
                result = deleteShopping(userId, approvedAction.get("payload"), String.valueOf(approvedAction.get("idempotency_key")));
                break;
            default:
                throw new IllegalArgumentException("不支持的助手操作");
        }
        result = new LinkedHashMap<>(result);
        result.put("executed", true);
        result.put("idempotency_key", requestKey);
        idempotentResults.put(key, result);
        if (idempotentResults.size() > 1000) idempotentResults.clear();
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> saveCalendar(Long userId, Map<String, Object> plan, boolean overwrite) {
        int saved = 0;
        int retained = 0;
        for (Object value : list(plan.get("meals"))) {
            if (!(value instanceof Map)) continue;
            Map<String, Object> meal = (Map<String, Object>) value;
            List<Object> dishes = list(meal.get("dishes"));
            if (dishes.isEmpty()) continue;
            RecipeRecord record = new RecipeRecord();
            record.setUserId(userId);
            record.setRecordDateString(String.valueOf(meal.get("date")));
            record.setRecordDate(parseDate(record.getRecordDateString()));
            record.setMealType(String.valueOf(meal.get("meal_type")));
            List<Long> dishIds = new ArrayList<>();
            List<String> names = new ArrayList<>();
            for (Object item : dishes) {
                if (!(item instanceof Map)) continue;
                Map<String, Object> dish = (Map<String, Object>) item;
                Object id = dish.get("id") != null ? dish.get("id") : dish.get("dish_id");
                if (id != null) dishIds.add(Long.valueOf(String.valueOf(id)));
                if (dish.get("name") != null) names.add(String.valueOf(dish.get("name")));
            }
            record.setDishIds(dishIds);
            record.setRecipeName(String.join("、", names));
            record.setIsManual(0);
            record.setPreserveExisting(!overwrite);
            RecipeRecord savedRecord = overwrite ? recipeRecordService.saveRecipeRecord(record) : recipeRecordService.saveRecipeRecordIfAbsent(record);
            if (savedRecord == null) retained++;
            else saved++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", overwrite ? "UPDATE_CALENDAR" : "SAVE_CALENDAR");
        result.put("saved_count", saved);
        result.put("retained_count", retained);
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deleteCalendar(Long userId, Map<String, Object> plan) {
        int deleted = 0;
        for (Object value : list(plan.get("meals"))) {
            if (!(value instanceof Map)) continue;
            Map<String, Object> meal = (Map<String, Object>) value;
            if (recipeRecordService.deleteRecordByDateAndMeal(userId, String.valueOf(meal.get("date")), String.valueOf(meal.get("meal_type")))) deleted++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", "DELETE_CALENDAR");
        result.put("deleted_count", deleted);
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> addShopping(Long userId, Map<String, Object> plan, String requestId, Object payload) {
        BigDecimal people = decimal(((Map<String, Object>) plan.getOrDefault("period", Collections.emptyMap())).get("people"), BigDecimal.valueOf(2));
        ShoppingBatchAddRequest request = new ShoppingBatchAddRequest();
        request.setRequestId(requestId);
        request.setTargetPeople(people);
        if (payload instanceof Map) {
            Object expectedVersion = ((Map<?, ?>) payload).get("expectedListVersion");
            request.setExpectedListVersion(longValue(expectedVersion));
        }
        for (Object value : list(plan.get("meals"))) {
            if (!(value instanceof Map)) continue;
            Map<String, Object> meal = (Map<String, Object>) value;
            for (Object dishValue : list(meal.get("dishes"))) {
                if (!(dishValue instanceof Map)) continue;
                Map<String, Object> dish = (Map<String, Object>) dishValue;
                Long dishId = longValue(dish.get("id") != null ? dish.get("id") : dish.get("dish_id"));
                if (dishId == null) continue;
                ShoppingPreviewRequest previewRequest = new ShoppingPreviewRequest();
                previewRequest.setDishIds(Collections.singletonList(dishId));
                previewRequest.setTargetPeople(people);
                ShoppingPreviewResponse preview = shoppingPreviewService.createPreview(userId, previewRequest);
                for (ShoppingDishDTO group : preview.getDishes()) {
                    ShoppingDishRequest groupRequest = new ShoppingDishRequest();
                    groupRequest.setSelectionKey("assistant-" + meal.get("date") + "-" + meal.get("meal_type") + "-" + dishId);
                    groupRequest.setItems(new ArrayList<>(group.getItems()));
                    request.getDishes().add(groupRequest);
                }
            }
        }
        ShoppingListResponse response = shoppingListService.batchAdd(userId, request).getList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", "ADD_SHOPPING_LIST");
        result.put("list", response);
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> updateShopping(Long userId, Object payload) {
        int updated = 0;
        for (Object value : list(payload instanceof Map ? ((Map<String, Object>) payload).get("items") : null)) {
            if (!(value instanceof Map)) continue;
            Map<String, Object> item = (Map<String, Object>) value;
            Long id = longValue(item.get("id"));
            if (id == null) continue;
            ShoppingItemPatchRequest patch = objectMapper.convertValue(item, ShoppingItemPatchRequest.class);
            shoppingListService.patchItem(userId, id, patch);
            updated++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", "UPDATE_SHOPPING_LIST");
        result.put("updated_count", updated);
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deleteShopping(Long userId, Object payload, String requestId) {
        Map<String, Object> body = payload instanceof Map ? (Map<String, Object>) payload : Collections.emptyMap();
        ShoppingClearRequest request = new ShoppingClearRequest();
        request.setRequestId(requestId);
        request.setScope(String.valueOf(body.getOrDefault("scope", "all")));
        request.setExpectedListVersion(longValue(body.get("expectedListVersion")));
        ShoppingListResponse response = shoppingListService.clear(userId, request);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", "DELETE_SHOPPING_LIST");
        result.put("list", response);
        return result;
    }

    private static List<Object> list(Object value) {
        return value instanceof List ? (List<Object>) value : Collections.emptyList();
    }

    private static Long longValue(Object value) {
        if (value == null) return null;
        try { return Long.valueOf(String.valueOf(value)); } catch (NumberFormatException ignored) { return null; }
    }

    private static BigDecimal decimal(Object value, BigDecimal fallback) {
        try { return value == null ? fallback : new BigDecimal(String.valueOf(value)); } catch (NumberFormatException ignored) { return fallback; }
    }

    private static java.util.Date parseDate(String value) {
        try {
            return java.util.Date.from(LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant());
        } catch (Exception error) {
            throw new IllegalArgumentException("日期格式无效，应为 yyyy-MM-dd");
        }
    }
}
