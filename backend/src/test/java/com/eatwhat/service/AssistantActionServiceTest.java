package com.eatwhat.service;

import com.eatwhat.entity.RecipeRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class AssistantActionServiceTest {
    @Test void calendarKeepsTheVerifiedHouseholdSize() {
        RecipeRecordService records = mock(RecipeRecordService.class);
        AssistantActionService service = new AssistantActionService(records, mock(ShoppingPreviewService.class), mock(ShoppingListService.class), new ObjectMapper());
        Map<String, Object> meal = new LinkedHashMap<>();
        meal.put("date", "2026-10-20"); meal.put("meal_type", "dinner");
        Map<String, Object> dish = new LinkedHashMap<>(); dish.put("id", 1); dish.put("name", "fish");
        meal.put("dishes", Collections.singletonList(dish));
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("period", Collections.singletonMap("people", 4));
        plan.put("meals", Collections.singletonList(meal));
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "SAVE_CALENDAR"); action.put("idempotency_key", "save-people");
        action.put("preview_token", "verified-token"); action.put("plan", plan);
        service.execute(1L, action);
        ArgumentCaptor<RecipeRecord> saved = ArgumentCaptor.forClass(RecipeRecord.class);
        verify(records).saveRecipeRecordIfAbsent(saved.capture());
        assertEquals(4, saved.getValue().getTargetPeople());
    }
}
