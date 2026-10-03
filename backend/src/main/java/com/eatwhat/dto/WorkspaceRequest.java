package com.eatwhat.dto;
import lombok.Data;
import java.util.*;
@Data
public class WorkspaceRequest {
    private String requestId;
    private Long expectedWorkspaceRevision;
    private Long planVersion;
    private Long expectedPlanRevision;
    private MealContext context;
    private String command;
    private Long dishId;
    private List<Long> dishIds = new ArrayList<>();
}
