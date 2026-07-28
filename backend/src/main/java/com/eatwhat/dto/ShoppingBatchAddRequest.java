package com.eatwhat.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingBatchAddRequest {
    private String requestId;
    private String previewId;
    private BigDecimal targetPeople;
    private List<ShoppingDishRequest> dishes = new ArrayList<>();
    private Long expectedListVersion;
}
