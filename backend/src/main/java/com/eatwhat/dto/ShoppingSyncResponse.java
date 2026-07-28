package com.eatwhat.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ShoppingSyncResponse {
    private ShoppingListResponse list;
    private boolean idempotent;
}
