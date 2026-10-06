package com.eatwhat.dto;
import lombok.Data;
import java.math.BigDecimal;
@Data
public class IngredientQuote {
    private String ingredientKey;
    private String canonicalName;
    private String normalizedVariant = "";
    private String sourceName;
    private String variant = "";
    private BigDecimal price;
    private BigDecimal unitQuantity;
    private String unitCode;
    private String unitFamily;
    private String quoteDate;
    private String sourceUrl;
    private String sourceLabel = "上海市发展和改革委员会";
    private String status = "MISSING";
    private Long batchId;
}
