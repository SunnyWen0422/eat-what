package com.eatwhat.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingDishDTO {
    private String selectionKey;
    private String sourceDate;
    private String sourceMealType;
    private Long shoppingDishId;
    private Long dishId;
    private String dishName;
    private BigDecimal targetPeople;
    private List<ShoppingPreviewItemDTO> items = new ArrayList<>();
}
