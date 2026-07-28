package com.eatwhat.entity;

import lombok.Data;
import java.util.Date;

@Data
public class IngredientCatalog {
    private Long id;
    private String canonicalName;
    private String aliases;
    private String unitFamily;
    private String defaultUnit;
    private Integer metadataVersion;
    private Date createdAt;
    private Date updatedAt;
}
