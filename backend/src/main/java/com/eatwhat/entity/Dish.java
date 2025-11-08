package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.Date;
import java.util.List;
import java.util.Arrays;

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
    
    @JsonProperty("calories")
    private Integer calories;
    
    @JsonProperty("protein")
    private Integer protein;
    
    @JsonProperty("material")
    private String material;  // 对应METERIAL字段
    
    @JsonProperty("steps")
    private String steps;  // 对应STEP字段
    
    @JsonProperty("tags")
    private String tagsString;  // 数据库存储格式（逗号分隔）
    
    @JsonProperty("isCustom")
    private Integer isCustom;  // 0-系统，1-用户自定义
    
    @JsonProperty("userId")
    private Long userId;
    
    @JsonProperty("createTime")
    private Date createTime;
    
    // 转换tags为数组（给前端使用）
    public List<String> getTags() {
        if (tagsString == null || tagsString.isEmpty()) {
            return Arrays.asList("家常");
        }
        return Arrays.asList(tagsString.split(","));
    }
    
    // 设置tags数组（从前端接收）
    public void setTags(List<String> tags) {
        if (tags != null && !tags.isEmpty()) {
            this.tagsString = String.join(",", tags);
        } else {
            this.tagsString = "家常";
        }
    }
}

