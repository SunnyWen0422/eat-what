package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class MealConsumptionRequest {
    private String requestId;
    private Long expectedRevision;
    private Long expectedPlanRevision;
    private String status;
    private Boolean usePlan = false;
    private List<Entry> dishes = new ArrayList<>();
    @Data public static class Entry {
        private Long dishId;
        private String name;
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        private Integer retainedEntryIndex;
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        private String type;
    }
}
