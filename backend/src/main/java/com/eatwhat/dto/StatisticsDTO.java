package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;
import java.util.Map;

/**
 * 饮食统计数据传输对象
 */
@Data
public class StatisticsDTO {

    @JsonProperty("success")
    private Boolean success = true;

    @JsonProperty("statistics")
    private StatisticsData statistics;

    @JsonProperty("daysWithRecords")
    private Integer daysWithRecords;

    @JsonProperty("dishes")
    private List<Dish> dishes;  // 所有涉及的菜品详情，供前端计算热量

    @Data
    public static class StatisticsData {
        @JsonProperty("meatCount")
        private Integer meatCount = 0;

        @JsonProperty("vegCount")
        private Integer vegCount = 0;

        @JsonProperty("soupCount")
        private Integer soupCount = 0;

        @JsonProperty("totalCalories")
        private Integer totalCalories = 0;  // 前端计算后返回，这里先设为0
    }
}
