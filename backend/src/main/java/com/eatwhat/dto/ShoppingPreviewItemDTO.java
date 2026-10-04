package com.eatwhat.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class ShoppingPreviewItemDTO {
    private Long id;
    private String clientKey;
    private String canonicalName;
    private String displayName;
    private String normalizedVariant;
    private String quantityKind;
    private BigDecimal quantityValue;
    private BigDecimal quantityMin;
    private BigDecimal quantityMax;
    private String quantityText;
    private String unitCode;
    private String unitFamily;
    private String sourceQuantityText;
    private Long sourceDishId;
    private String sourceDishName;
    private Integer sourceLineNo;
    private BigDecimal sourceBasePeople;
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean servingsVerified;
    private String calculationStatus;
    private String parseStatus;
    private boolean userOverride;
    private boolean checked;
    private List<String> warnings = new ArrayList<>();
}
