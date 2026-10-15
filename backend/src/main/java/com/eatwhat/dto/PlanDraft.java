package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import lombok.Data;
import java.util.*;

@Data
public class PlanDraft {
    /** Present on a history checkpoint only; old history remains compatible. */
    private MealContext contextSnapshot;
    private boolean adjustedBeforeConfirmation;
    private String contextFingerprint;
    private String requirementsFingerprint;
    private Long planVersion = 0L;
    private List<Dish> dishes = new ArrayList<>();
    private Set<Long> lockedDishIds = new LinkedHashSet<>();
    private String source = "rules";
    private List<String> explanations = new ArrayList<>();
    private Map<String,Object> recommendationEvidence = new LinkedHashMap<>();
    private Integer totalCookMinutes;
    private List<PlanDraft> history = new ArrayList<>();
}
