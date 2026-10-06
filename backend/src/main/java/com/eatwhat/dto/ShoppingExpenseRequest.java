package com.eatwhat.dto;
import lombok.Data;
@Data public class ShoppingExpenseRequest {
 private String requestId,ingredientKey,amount,channel;
 private Long expectedListVersion;
 private boolean remove;
}
