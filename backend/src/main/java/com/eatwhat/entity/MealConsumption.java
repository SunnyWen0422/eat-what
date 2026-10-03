package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class MealConsumption {
    private Long id;
    @JsonIgnore private Long userId;
    private String mealDate;
    private String mealType;
    private String status;
    private Long revision;
    private Long sourceRecordId;
    @JsonIgnore private String plannedSnapshotJson;
    @JsonIgnore private String actualDishesJson;
    private Map<String,Object> plannedSnapshot;
    private List<Map<String,Object>> actualDishes;
}
