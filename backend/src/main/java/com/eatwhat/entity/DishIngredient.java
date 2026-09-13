package com.eatwhat.entity;

import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

@Data
public class DishIngredient {
    private Long id;
    private Long dishId;
    private Integer sequenceNo;
    private String sourceText;
    private String canonicalName;
    private String quantityKind;
    private BigDecimal quantityValue;
    private BigDecimal quantityMin;
    private BigDecimal quantityMax;
    private String unitCode;
    private String unitFamily;
    private String category;
    private String preparation;
    private BigDecimal basePeople;
    private BigDecimal sourceAllowancePercent;
    private String parseStatus;
    private String parseMessage;
    private String sourceHash;
    private Integer metadataVersion;
    private Date createdAt;
    private Date updatedAt;
}
