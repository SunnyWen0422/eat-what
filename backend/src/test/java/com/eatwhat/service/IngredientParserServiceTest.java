package com.eatwhat.service;

import com.eatwhat.dto.IngredientParseResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class IngredientParserServiceTest {
    private final IngredientParserService parser = new IngredientParserService();

    @Test
    void parsesStructuredMassQuantity() {
        IngredientParseResult result = parser.parse("猪排|345|克|主料|切片", "2名成年人总量+15%冗余");
        assertEquals("PARSED", result.getParseStatus());
        assertEquals(new BigDecimal("345"), result.getQuantity().getValue());
        assertEquals("mass", result.getQuantity().getUnitFamily());
        assertEquals("SOURCE_ALLOWANCE_INCLUDED", parser.explainAllowance("2名成年人总量+15%冗余"));
    }

    @Test
    void scalesByPeopleWithoutAddingAllowanceAgain() {
        assertEquals(new BigDecimal("690"), parser.scale(new BigDecimal("345"), new BigDecimal("2"), new BigDecimal("4")));
    }

    @Test
    void keepsQualitativeQuantityVisible() {
        IngredientParseResult result = parser.parse("盐|适量|调味料", "2名成年人总量+15%冗余");
        assertEquals("NEEDS_ADJUSTMENT", result.getParseStatus());
        assertNotNull(result.getIngredientName());
    }
}
