package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.Date;

/**
 * 菜品实体类 - 映射food表
 */
@Data
public class Dish {

    @JsonProperty("id")
    private Long id;

    @JsonProperty("name")
    private String name;

    @JsonProperty("type")
    private String type;  // meat/veg/soup

    @JsonProperty("cl")
    private String cl;  // 菜品材料

    @JsonProperty("fl")
    private String fl;  // 分量

    @JsonProperty("step")
    private String step;  // 步骤

    @JsonProperty("tags")
    private String tags;  // 标签，逗号分隔

    @JsonProperty("image")
    private String image;  // 菜品图片URL

    @JsonProperty("difficulty")
    private String difficulty;  // 难度：简单/普通/困难

    @JsonProperty("cookTime")
    private String cookTime;  // 烹饪时间

    @JsonProperty("ingredientsAmounts")
    private String ingredientsAmounts;  // 食材与用量

    @JsonProperty("steps")
    private String steps;  // 详细步骤

    @JsonProperty("stepImages")
    private String stepImages;  // 步骤图片URL，JSON数组格式

    @JsonProperty("tips")
    private String tips;  // 小贴士

    @JsonProperty("methods")
    private String methods;  // 烹饪方法

    @JsonProperty("kcal")
    private Integer kcal;  // 热量（千卡）

    @JsonProperty("isCustom")
    private Integer isCustom;  // 0-系统，1-用户自定义

    @JsonProperty("userId")
    private Long userId;

    @JsonProperty("createTime")
    private Date createTime;
}
