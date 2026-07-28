package com.eatwhat.dto;

import com.eatwhat.util.DecimalQuantity;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class IngredientParseResult {
    private String parseStatus;
    private String quantityKind;
    private String sourceText;
    private String message;
    private String ingredientName;
    private String category;
    private String preparation;
    private DecimalQuantity quantity;
    private boolean sourceAllowanceIncluded;

    public static IngredientParseResult failed(String sourceText, String message) {
        return new IngredientParseResult("FAILED", "UNKNOWN", sourceText, message, sourceText, null, null, null, false);
    }

    public static IngredientParseResult needsAdjustment(String sourceText, String message) {
        return new IngredientParseResult("NEEDS_ADJUSTMENT", "QUALITATIVE", sourceText, message, sourceText, null, null, null, false);
    }

    public boolean isNumeric() {
        return quantity != null && quantity.getValue() != null;
    }
}
