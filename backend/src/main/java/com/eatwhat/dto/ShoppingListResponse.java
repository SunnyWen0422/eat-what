package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingListResponse {
    private java.util.Map<String, ShoppingExpense> expenses = new java.util.LinkedHashMap<>();
    private Long listId;
    private Long version = 0L;
    private List<ShoppingDishDTO> dishes = new ArrayList<>();
    private PurchaseSummaryDTO purchaseSummary = new PurchaseSummaryDTO(new ArrayList<PurchaseSummaryItemDTO>(), new ArrayList<PurchaseSummaryItemDTO>());
    private int pendingCount;
    private int checkedCount;
    private int metadataVersion = 1;
}
