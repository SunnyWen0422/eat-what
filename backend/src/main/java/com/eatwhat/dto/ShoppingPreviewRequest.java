package com.eatwhat.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingPreviewRequest {
    private List<Long> dishIds = new ArrayList<>();
    private Long recipeId;
    private BigDecimal targetPeople = new BigDecimal("2");
    private String clientRequestId;
}
