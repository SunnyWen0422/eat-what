package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;
import java.util.Map;

/**
 * 旧计划统计传输对象；实际用餐回顾使用 /diet-reviews。
 */
@Data
public class StatisticsDTO {

    private String basis = "plan";
    private Boolean deprecated = true;
    private String description = "旧接口只统计日历计划，不代表实际吃过；实际饮食报告请使用 /diet-reviews。没有实际食用份量，不提供热量估计。";

    @JsonProperty("success")
    private Boolean success = true;

    @JsonProperty("statistics")
    private StatisticsData statistics;

    @JsonProperty("daysWithRecords")
    private Integer daysWithRecords;

    @JsonProperty("dishes")
    private List<Dish> dishes;  // 计划涉及的菜品，不能据此计算实际摄入

    @Data
    public static class StatisticsData {
        @JsonProperty("meatCount")
        private Integer meatCount = 0;

        @JsonProperty("vegCount")
        private Integer vegCount = 0;

        @JsonProperty("soupCount")
        private Integer soupCount = 0;

        @JsonProperty("totalCalories")
        private Integer totalCalories;  // 无可靠实际食用份量，null 表示未知而非零摄入
    }
}
