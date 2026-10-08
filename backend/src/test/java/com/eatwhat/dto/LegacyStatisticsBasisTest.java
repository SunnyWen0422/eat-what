package com.eatwhat.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class LegacyStatisticsBasisTest {
    @Test void legacyPlanNumbersAreLabeledAndDoNotClaimZeroCalorieIntake() {
        StatisticsDTO dto = new StatisticsDTO();
        StatisticsDTO.StatisticsData counts = new StatisticsDTO.StatisticsData();
        counts.setMeatCount(3); dto.setStatistics(counts);
        JsonNode data = new ObjectMapper().valueToTree(dto);
        assertEquals("plan", data.path("basis").asText());
        assertTrue(data.path("deprecated").asBoolean());
        assertEquals(3,data.path("statistics").path("meatCount").asInt());
        assertTrue(data.path("statistics").has("totalCalories"));
        assertTrue(data.path("statistics").path("totalCalories").isNull());
    }
}
