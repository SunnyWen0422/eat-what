package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatApplicationServiceTest {

    @Mock
    private AiChatGateway gateway;
    @Mock
    private CustomDishService customDishService;
    private ChatApplicationService service;

    @BeforeEach
    void setUp() {
        service = new ChatApplicationService(gateway, customDishService);
    }

    @Test
    void authenticatedSaveActionUsesServerIdentityAndJavaPersistence() {
        Map<String, Object> request = new HashMap<>();
        request.put("message", "加入我的菜谱");
        request.put("user_id", "999");
        Map<String, Object> dish = new HashMap<>();
        dish.put("name", "番茄炒蛋");
        dish.put("type", "veg");
        dish.put("cl", "番茄#鸡蛋");
        dish.put("step", "炒熟");
        Map<String, Object> action = new HashMap<>();
        action.put("type", "CREATE_CUSTOM_DISH");
        action.put("dish", dish);
        Map<String, Object> aiResponse = new HashMap<>();
        aiResponse.put("success", true);
        aiResponse.put("reply", "正在加入");
        aiResponse.put("action", action);
        when(gateway.chatSync(any())).thenReturn(aiResponse);
        when(customDishService.createDish(eq(7L), any(Dish.class))).thenAnswer(invocation -> invocation.getArgument(1));

        Map<String, Object> result = service.chatSync(request, 7L);

        ArgumentCaptor<Map<String, Object>> payload = ArgumentCaptor.forClass(Map.class);
        verify(gateway).chatSync(payload.capture());
        assertEquals("7", payload.getValue().get("user_id"));
        ArgumentCaptor<Dish> created = ArgumentCaptor.forClass(Dish.class);
        verify(customDishService).createDish(eq(7L), created.capture());
        assertEquals("番茄炒蛋", created.getValue().getName());
        assertFalse(result.containsKey("action"));
        assertTrue(result.get("reply").toString().contains("已把"));
    }

    @Test
    void guestSaveActionDoesNotWriteAndPromptsForLogin() {
        Map<String, Object> action = new HashMap<>();
        action.put("type", "CREATE_CUSTOM_DISH");
        action.put("dish", Collections.singletonMap("name", "番茄炒蛋"));
        Map<String, Object> aiResponse = new HashMap<>();
        aiResponse.put("success", true);
        aiResponse.put("action", action);
        when(gateway.chatSync(any())).thenReturn(aiResponse);

        Map<String, Object> result = service.chatSync(Collections.singletonMap("message", "加入"), null);

        verify(customDishService, never()).createDish(any(), any());
        assertTrue(result.get("reply").toString().contains("登录"));
    }
}
