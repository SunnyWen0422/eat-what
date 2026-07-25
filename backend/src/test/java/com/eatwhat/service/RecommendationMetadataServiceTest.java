package com.eatwhat.service;

import com.eatwhat.dto.RecommendationOptionsDTO;
import com.eatwhat.mapper.DishMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationMetadataServiceTest {

    @Test
    void catalogLoadsStableCodesAliasesAndDatabaseCounts() {
        DishMapper mapper = mock(DishMapper.class);
        when(mapper.countByTagCode("HOME_STYLE")).thenReturn(6035);
        when(mapper.countByCuisineCode("SICHUAN")).thenReturn(162);
        when(mapper.countByCuisineCode("CANTONESE")).thenReturn(65);
        RecommendationMetadataService service = new RecommendationMetadataService(mapper);

        RecommendationOptionsDTO options = service.getOptions();
        List<RecommendationOptionsDTO.Option> home = options.getHomeQuickOptions();

        assertEquals(1, options.getMetadataVersion());
        assertEquals("3.2.0", options.getMinimumClientVersion());
        assertEquals(Arrays.asList("家常菜", "川菜", "粤菜"), home.stream().map(RecommendationOptionsDTO.Option::getLabel).collect(Collectors.toList()));
        assertEquals(Arrays.asList(6035, 162, 65), home.stream().map(RecommendationOptionsDTO.Option::getCount).collect(Collectors.toList()));
        assertTrue(service.isKnownCuisine("SICHUAN"));
        assertTrue(service.isKnownTag("NUMB_SPICY"));
        assertEquals("CANTONESE", service.resolveAlias("cuisine", "广东菜"));
    }

    @Test
    void catalogRejectsUnknownGroupsAndDuplicateAliases() throws Exception {
        DishMapper mapper = mock(DishMapper.class);
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode unknownGroup = objectMapper.readTree(validCatalogJson());
        ((ObjectNode) unknownGroup.path("groups")).set("unknown", objectMapper.createArrayNode());
        assertThrows(IllegalStateException.class, () -> new RecommendationMetadataService(mapper, unknownGroup));

        JsonNode duplicateAlias = objectMapper.readTree(validCatalogJson());
        ((ObjectNode) duplicateAlias.path("groups")).set("flavor", objectMapper.readTree(
                "[{\"code\":\"SPICY\",\"label\":\"spicy\",\"aliases\":[\"same\"]}," +
                        "{\"code\":\"LIGHT\",\"label\":\"light\",\"aliases\":[\"same\"]}]"));
        assertThrows(IllegalStateException.class, () -> new RecommendationMetadataService(mapper, duplicateAlias));

        JsonNode duplicateCode = objectMapper.readTree(validCatalogJson());
        ((ObjectNode) duplicateCode.path("groups")).set("diet", objectMapper.readTree(
                "[{\"code\":\"SPICY\",\"label\":\"duplicate\",\"aliases\":[]}]"));
        assertThrows(IllegalStateException.class, () -> new RecommendationMetadataService(mapper, duplicateCode));
    }

    private String validCatalogJson() {
        return "{\"metadataVersion\":1,\"minimumClientVersion\":\"3.2.0\"," +
                "\"homeQuickOptions\":[{\"id\":\"home\",\"kind\":\"tag\",\"code\":\"HOME_STYLE\",\"label\":\"home\"}]," +
                "\"groups\":{" +
                "\"cuisine\":[{\"code\":\"SICHUAN\",\"label\":\"sichuan\",\"aliases\":[\"sichuan\"]}]," +
                "\"flavor\":[{\"code\":\"SPICY\",\"label\":\"spicy\",\"aliases\":[\"spicy\"]}]," +
                "\"scene\":[{\"code\":\"HOME_STYLE\",\"label\":\"home\",\"aliases\":[\"home\"]}]," +
                "\"diet\":[],\"method\":[]}}";
    }
}
