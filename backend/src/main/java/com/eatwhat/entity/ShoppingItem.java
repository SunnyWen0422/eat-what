package com.eatwhat.entity;

import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

@Data
public class ShoppingItem {
    private Long id;
    private Long shoppingDishId;
    private Integer sourceLineNo;
    private String canonicalName;
    private String displayName;
    private String normalizedVariant;
    private BigDecimal quantityValue;
    private BigDecimal quantityMin;
    private BigDecimal quantityMax;
    private String quantityText;
    private String unitCode;
    private String unitFamily;
    private String category;
    private String sourceQuantityText;
    private String parseStatus;
    private String calculationStatus;
    private Boolean checked;
    private Boolean userOverride;
    private Date createdAt;
    private Date updatedAt;
}
