package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Service
public class ChatApplicationService {

    private final AiChatGateway gateway;
    private final CustomDishService customDishService;

    public ChatApplicationService(AiChatGateway gateway, CustomDishService customDishService) {
        this.gateway = gateway;
        this.customDishService = customDishService;
    }

    public Map<String, Object> chatSync(Map<String, Object> request, Long userId) {
        Map<String, Object> response = new HashMap<>(gateway.chatSync(createPayload(request, userId)));
        applyAction(response, userId);
        return response;
    }

    public void streamChat(Map<String, Object> request, Long userId, OutputStream output) {
        gateway.streamChat(createPayload(request, userId), output);
    }

    private Map<String, Object> createPayload(Map<String, Object> request, Long userId) {
        Map<String, Object> payload = new HashMap<>(request == null ? Collections.emptyMap() : request);
        payload.put("user_id", userId == null ? "guest" : userId.toString());
        return payload;
    }

    @SuppressWarnings("unchecked")
    private void applyAction(Map<String, Object> response, Long userId) {
        Object rawAction = response.remove("action");
        if (!(rawAction instanceof Map)) return;
        Map<String, Object> action = (Map<String, Object>) rawAction;
        if (!"CREATE_CUSTOM_DISH".equals(action.get("type"))) return;

        if (userId == null) {
            response.put("actionCompleted", false);
            response.put("reply", "请先登录，再把这道菜加入自定义菜谱。");
            return;
        }

        Object rawDish = action.get("dish");
        if (!(rawDish instanceof Map)) {
            response.put("actionCompleted", false);
            response.put("reply", "没有识别到可保存的菜品，请重新推荐后再试。");
            return;
        }

        Dish dish = toDish((Map<String, Object>) rawDish);
        try {
            Dish created = customDishService.createDish(userId, dish);
            response.put("actionCompleted", true);
            response.put("savedDish", created);
            response.put("reply", "已把【" + created.getName() + "】加入你的自定义菜谱！");
        } catch (RuntimeException e) {
            response.put("actionCompleted", false);
            response.put("success", false);
            response.put("reply", "暂时无法保存这道菜，请稍后重试。");
        }
    }

    private Dish toDish(Map<String, Object> values) {
        Dish dish = new Dish();
        dish.setName(stringValue(values.get("name")));
        dish.setType(defaultValue(stringValue(values.get("type")), "veg"));
        dish.setCl(stringValue(values.get("cl")));
        dish.setStep(stringValue(values.get("step")));
        return dish;
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private String defaultValue(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
