package com.eatwhat.dto;
import lombok.Data;
import java.math.BigDecimal;
@Data
public class ShoppingExpense {
    private String ingredientKey;
    private BigDecimal amount;
    private String channel;
    private String requestId;
    private Long expectedListVersion;
}
