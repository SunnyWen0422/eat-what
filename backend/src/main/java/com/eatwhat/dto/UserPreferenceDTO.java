package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Data
public class UserPreferenceDTO {
    private List<String> preferredCuisineCodes = new ArrayList<>();
    private List<String> preferredTagCodes = new ArrayList<>();
    private List<String> excludedTagCodes = new ArrayList<>();
    private List<String> excludedIngredients = new ArrayList<>();
    private Integer avoidRecentDays = 7;
    private Integer maxCookMinutes;
    private Integer version = 1;
    private Date updatedAt;
}
