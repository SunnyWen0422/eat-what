package com.eatwhat.dto;
import lombok.Data;
import java.util.List;
@Data
public class ShoppingCheckRequest {
    private String requestId;
    private Long expectedListVersion;
    private List<Long> itemIds;
    private Boolean checked;
}
