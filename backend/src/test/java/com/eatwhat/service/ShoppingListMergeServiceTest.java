package com.eatwhat.service;

import com.eatwhat.dto.ShoppingPreviewItemDTO;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ShoppingListMergeServiceTest {
    private final ShoppingListMergeService service = new ShoppingListMergeService();

    @Test
    void mergesOnlyWithinOneDishGroup() {
        ShoppingPreviewItemDTO first = item("a", new BigDecimal("300"));
        ShoppingPreviewItemDTO second = item("a", new BigDecimal("400"));
        List<ShoppingPreviewItemDTO> merged = service.mergeWithinDish(10L, Arrays.asList(first, second));
        assertEquals(1, merged.size());
        assertEquals(new BigDecimal("700"), merged.get(0).getQuantityValue());
    }

    @Test
    void keepsDifferentDishKeysSeparate() {
        ShoppingPreviewItemDTO first = item("dish-a", new BigDecimal("300"));
        ShoppingPreviewItemDTO second = item("dish-b", new BigDecimal("400"));
        assertEquals(2, service.groupByDish(Arrays.asList(first, second)).size());
    }

    private ShoppingPreviewItemDTO item(String key, BigDecimal value) {
        ShoppingPreviewItemDTO item = new ShoppingPreviewItemDTO();
        item.setCanonicalName("猪排");
        item.setDisplayName("猪排");
        item.setQuantityValue(value);
        item.setQuantityText(value + "g");
        item.setUnitCode("g");
        item.setUnitFamily("mass");
        item.setParseStatus("PARSED");
        item.setNormalizedVariant(key);
        return item;
    }
}
