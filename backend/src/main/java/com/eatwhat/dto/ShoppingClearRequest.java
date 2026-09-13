package com.eatwhat.dto;

import lombok.Data;

@Data
public class ShoppingClearRequest {
    private String requestId;
    private String scope = "completed";
    private Long expectedListVersion;
}
