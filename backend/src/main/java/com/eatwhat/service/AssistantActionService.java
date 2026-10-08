package com.eatwhat.service;

import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Executes the server-approved legacy calendar snapshot, with a durable Java receipt. */
@Service
public class AssistantActionService {
    private final RecipeRecordService recipeRecordService;
    private final MealConsumptionMapper receipts;
    private final ObjectMapper objectMapper;

    public AssistantActionService(RecipeRecordService recipeRecordService,
                                  MealConsumptionMapper receipts,
                                  ObjectMapper objectMapper) {
        this.recipeRecordService = Objects.requireNonNull(recipeRecordService);
        this.receipts = Objects.requireNonNull(receipts);
        this.objectMapper = objectMapper.copy().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
    }

    /** The user lock, all meal writes, and their receipt commit or roll back together. */
    @Transactional
    public Map<String, Object> execute(Long userId, Map<String, Object> approvedAction) {
        if (userId == null) throw new IllegalArgumentException("用户未登录");
        if (approvedAction == null) throw new IllegalArgumentException("确认动作不能为空");
        String actionType = requiredText(approvedAction.get("type"), "操作类型不能为空");
        requireCalendarSave(actionType);
        String requestKey = requiredText(approvedAction.get("idempotency_key"), "幂等键不能为空");
        requiredText(approvedAction.get("preview_token"), "预览凭证不能为空");
        // One namespace for both aliases: reusing a key with a different action must conflict.
        // 14-character operation tag + 64-character hash fits the existing VARCHAR(80).
        String receiptId = "assistant-cal-" + WorkflowRequestHash.sha256(requestKey);
        String requestHash = WorkflowRequestHash.sha256("assistant-calendar-v1|" + encode(approvedAction));
        if (receipts.lockUser(userId) == null) throw new IllegalArgumentException("用户不存在");
        Map<String, Object> prior = receipts.request(userId, receiptId);
        if (prior != null) {
            if (!requestHash.equals(prior.get("requestHash"))) {
                throw new MealConsumptionService.VersionConflict("确认标识已用于不同内容，请重新预览并确认");
            }
            return readReceipt(prior);
        }
        if (!(approvedAction.get("plan") instanceof Map)) throw new IllegalArgumentException("确认方案无效");
        @SuppressWarnings("unchecked")
        Map<String, Object> plan = (Map<String, Object>) approvedAction.get("plan");
        Map<String, Object> result = saveCalendar(userId, plan);
        result.put("executed", true);
        result.put("idempotency_key", requestKey);
        if (receipts.log(userId, receiptId, requestHash, encode(result)) != 1) {
            throw new IllegalStateException("助手执行记录保存失败");
        }
        return result;
    }

    /** Legacy mutation previews lack the revision bindings required by the normal write APIs. */
    public static void requireCalendarSave(String actionType) {
        if ("SAVE_CALENDAR".equals(actionType) || "CREATE_CALENDAR".equals(actionType)) return;
        if (Arrays.asList("UPDATE_CALENDAR", "DELETE_CALENDAR").contains(actionType)) {
            throw new MealConsumptionService.VersionConflict("请在日历页面查看最新安排后修改或删除");
        }
        if (Arrays.asList("ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST").contains(actionType)) {
            throw new MealConsumptionService.VersionConflict("请通过购物清单预览或购物清单页面确认操作");
        }
        throw new IllegalArgumentException("不支持的助手操作");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> saveCalendar(Long userId, Map<String, Object> plan) {
        int saved = 0;
        int retained = 0;
        Object periodValue = plan.get("period");
        Map<?, ?> period = periodValue instanceof Map ? (Map<?, ?>) periodValue : Collections.emptyMap();
        Object peopleValue = period.get("people");
        int targetPeople = peopleValue == null ? 2 : Integer.parseInt(String.valueOf(peopleValue));
        if (targetPeople < 1 || targetPeople > 50) throw new IllegalArgumentException("人数应为 1 至 50");
        if (!(plan.get("meals") instanceof List)) throw new IllegalArgumentException("确认方案的餐食无效");
        for (Object value : (List<?>) plan.get("meals")) {
            if (!(value instanceof Map)) throw new IllegalArgumentException("确认方案的餐食无效");
            Map<String, Object> meal = (Map<String, Object>) value;
            if (!(meal.get("dishes") instanceof List)) throw new IllegalArgumentException("确认方案的菜品无效");
            List<?> dishes = (List<?>) meal.get("dishes");
            if (dishes.isEmpty()) continue;
            RecipeRecord record = new RecipeRecord();
            record.setUserId(userId);
            record.setRecordDateString(String.valueOf(meal.get("date")));
            record.setRecordDate(parseDate(record.getRecordDateString()));
            record.setMealType(String.valueOf(meal.get("meal_type")));
            List<Long> dishIds = new ArrayList<>();
            List<String> names = new ArrayList<>();
            for (Object item : dishes) {
                if (!(item instanceof Map)) throw new IllegalArgumentException("确认方案的菜品无效");
                Map<String, Object> dish = (Map<String, Object>) item;
                Object id = dish.get("id") != null ? dish.get("id") : dish.get("dish_id");
                if (id == null) throw new IllegalArgumentException("确认方案的菜品缺少标识");
                dishIds.add(Long.valueOf(String.valueOf(id)));
                if (dish.get("name") != null) names.add(String.valueOf(dish.get("name")));
            }
            record.setDishIds(dishIds);
            record.setRecipeName(String.join("、", names));
            record.setIsManual(0);
            record.setTargetPeople(targetPeople);
            record.setPreserveExisting(true);
            // This service validates each dish against the authenticated owner's accessible dishes.
            RecipeRecord savedRecord = recipeRecordService.saveRecipeRecordIfAbsent(record);
            if (savedRecord == null) retained++;
            else saved++;
        }
        if (saved + retained == 0) throw new IllegalArgumentException("方案中没有可保存的菜品");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("action", "SAVE_CALENDAR");
        result.put("saved_count", saved);
        result.put("retained_count", retained);
        return result;
    }

    private String encode(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception error) { throw new IllegalStateException("助手执行记录序列化失败", error); }
    }

    private Map<String, Object> readReceipt(Map<String, Object> prior) {
        try {
            Map<String, Object> receipt = objectMapper.readValue(String.valueOf(prior.get("responseJson")),
                    new TypeReference<Map<String, Object>>() { });
            if (!Boolean.TRUE.equals(receipt.get("success")) || !Boolean.TRUE.equals(receipt.get("executed"))) {
                throw new IllegalStateException("助手执行记录无效");
            }
            return receipt;
        } catch (Exception error) { throw new IllegalStateException("助手执行记录无法读取", error); }
    }

    private static String requiredText(Object value, String message) {
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) throw new IllegalArgumentException(message);
        return (String) value;
    }

    private static java.util.Date parseDate(String value) {
        try {
            return java.util.Date.from(LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant());
        } catch (Exception error) {
            throw new IllegalArgumentException("日期格式无效，应为 yyyy-MM-dd");
        }
    }
}
