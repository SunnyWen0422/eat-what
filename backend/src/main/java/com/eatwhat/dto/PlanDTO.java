package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * 推荐方案 DTO
 */
@Data
public class PlanDTO {

    @JsonProperty("dishes")
    private List<Dish> dishes;

    public PlanDTO() {
    }

    public PlanDTO(List<Dish> dishes) {
        this.dishes = dishes;
    }
}
