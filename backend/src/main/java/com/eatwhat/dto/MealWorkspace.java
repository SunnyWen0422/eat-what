package com.eatwhat.dto;

import lombok.Data;
import java.util.*;

@Data
public class MealWorkspace {
    private String id;
    private Long revision = 0L;
    private MealContext context;
    private PlanDraft draft = new PlanDraft();
    /** Server-owned, survives undo and is shared by all entry points for this meal. */
    private Map<String, Set<String>> recommendationCycle = new LinkedHashMap<>();
    private String status = "empty";
    private String taskId;
    private String message;
    private Map<String, String> suggestedTarget;
    private Map<String, Object> confirmation;
}
