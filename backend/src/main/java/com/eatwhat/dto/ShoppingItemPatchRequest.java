package com.eatwhat.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class ShoppingItemPatchRequest {
    private String displayName;
    private BigDecimal quantityValue;
    private String quantityText;
    private String unitCode;
    private Boolean checked;
    private Boolean userOverride;
    private Long expectedListVersion;
}
