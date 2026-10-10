package com.eatwhat.dto;
import lombok.Data;
import java.util.*;
@Data
public class WorkspaceRequest {
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean releaseLegacyLocks;
    private Long menuId;
    private Long menuVersion;
    private String menuDate;
    private String menuMealType;
    private String requestId;
    private Long expectedWorkspaceRevision;
    private Long planVersion;
    private Long expectedPlanRevision;
    private MealContext context;
    private String command;
    private Long dishId;
    private List<Long> dishIds = new ArrayList<>();
    // Omitted targets must serialize exactly as old requests, preserving logged hashes.
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String targetDate;
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String targetMealType;
}
