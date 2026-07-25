package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class EffectiveRecommendationCriteria extends RecommendationCriteria {
    private List<String> preferredCuisineCodes = new ArrayList<>();
    private List<String> preferredTagCodes = new ArrayList<>();
    private Integer avoidRecentDays = 7;
}
