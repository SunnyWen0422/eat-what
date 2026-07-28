package com.eatwhat.entity;

import lombok.Data;
import java.util.Date;

@Data
public class ShoppingList {
    private Long id;
    private Long userId;
    private Long version;
    private Integer metadataVersion;
    private Date createdAt;
    private Date updatedAt;
}
