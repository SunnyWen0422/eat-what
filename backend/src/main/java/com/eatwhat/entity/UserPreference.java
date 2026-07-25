package com.eatwhat.entity;

import lombok.Data;
import java.util.Date;

@Data
public class UserPreference {
    private Long userId;
    private String preferredCuisinesJson;
    private String preferredTagsJson;
    private String excludedTagsJson;
    private String excludedIngredientsJson;
    private Integer avoidRecentDays;
    private Integer maxCookMinutes;
    private Integer version;
    private Date updatedAt;
}
