package com.eatwhat.entity;

import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

@Data
public class ShoppingDish {
    private Long id;
    private Long shoppingListId;
    private String selectionKey;
    private String sourceDate;
    private String sourceMealType;
    private Long dishId;
    private String dishName;
    private BigDecimal targetPeople;
    private Date createdAt;
    private Date updatedAt;
}
