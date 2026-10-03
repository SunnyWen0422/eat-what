package com.eatwhat.dto;

import lombok.Data;
import java.util.*;

@Data
public class MealWorkspace {
    private String id;
    private Long revision = 0L;
    private MealContext context;
    private PlanDraft draft = new PlanDraft();
    private String status = "empty";
    private String taskId;
    private String message;
    private Map<String, String> suggestedTarget;
    private Map<String, Object> confirmation;
}
