package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingDishRequest {
    private String selectionKey;
    private java.math.BigDecimal targetPeople;
    private String sourceDate;
    private String sourceMealType;
    private List<ShoppingPreviewItemDTO> items = new ArrayList<>();
}
