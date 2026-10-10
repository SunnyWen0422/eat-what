package com.eatwhat.dto;

import lombok.Data;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.*;

@Data
public class MealContext {
    private String date;
    private String mealType = "lunch";
    @JsonDeserialize(using = MealIntegerDeserializer.class)
    private Integer people = 2;
    private String compositionMode = "auto";
    @JsonDeserialize(contentUsing = MealIntegerDeserializer.class)
    private Map<String, Integer> counts = new LinkedHashMap<>();
    private Integer totalCookMinutes;
    private RecommendationCriteria criteria = new RecommendationCriteria();
    private String requirements = "";
    private List<String> ownedIngredients = new ArrayList<>();
}
