package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * 推荐请求 DTO
 */
@Data
public class RecommendRequest {

    @JsonProperty("people")
    private Integer people = 2;

    @JsonProperty("meat")
    private Integer meat = 2;

    @JsonProperty("veg")
    private Integer veg = 2;

    @JsonProperty("soup")
    private Integer soup = 1;

    @JsonProperty("mealType")
    private String mealType = "lunch";

    @JsonProperty("userSelectedDishes")
    private List<Dish> userSelectedDishes;
}
