package com.eatwhat.dto;
import lombok.Data;
@Data
public class ShoppingManualRequest {
    private String requestId;
    private Long expectedListVersion;
    private String name;
    private String quantityText;
    private String note;
}
