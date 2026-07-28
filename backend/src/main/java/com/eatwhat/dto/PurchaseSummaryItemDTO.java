package com.eatwhat.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class PurchaseSummaryItemDTO {
    private String canonicalName;
    private String displayName;
    private BigDecimal quantityValue;
    private String quantityText;
    private String unitCode;
    private String unitFamily;
    private List<String> sourceDishNames = new ArrayList<>();
    private String sourceDishLabel;

    public PurchaseSummaryItemDTO add(BigDecimal value, String sourceDishName) {
        if (value != null) quantityValue = quantityValue == null ? value : quantityValue.add(value);
        if (sourceDishName != null && !sourceDishNames.contains(sourceDishName)) sourceDishNames.add(sourceDishName);
        sourceDishLabel = String.join("、", sourceDishNames);
        quantityText = quantityValue == null ? "需调整" : quantityValue.stripTrailingZeros().toPlainString() + unitCode;
        return this;
    }
}
