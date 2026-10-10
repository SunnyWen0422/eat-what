package com.eatwhat.dto;

import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ShoppingSyncResponse {
    private ShoppingListResponse list;
    private boolean idempotent;
    // Source ingredient lines, never display-summary rows. Null for legacy receipts.
    private Integer addedItemCount;
    private Integer mergedItemCount;

    public ShoppingSyncResponse(ShoppingListResponse list, boolean idempotent) {
        this(list, idempotent, null, null);
    }
}
