package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class RecommendationCriteria {
    private List<String> cuisineCodes = new ArrayList<>();
    private List<String> includeTagCodes = new ArrayList<>();
    private List<String> excludeTagCodes = new ArrayList<>();
    private List<String> excludedIngredients = new ArrayList<>();
    private Integer maxCookMinutes;
}
