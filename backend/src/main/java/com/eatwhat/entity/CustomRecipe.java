package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 用户自定义菜谱实体类
 */
@Data
public class CustomRecipe {
    
    @JsonProperty("id")
    private Long id;
    
    @JsonProperty("name")
    private String name;
    
    @JsonProperty("people")
    private Integer people;
    
    @JsonProperty("userId")
    private Long userId;
    
    @JsonProperty("dishIdsString")
    private String dishIdsString;
    
    @JsonProperty("mealType")
    private String mealType;
    
    @JsonProperty("createTime")
    private Date createTime;
    
    private static final ObjectMapper mapper = new ObjectMapper();
    
    public List<Long> getDishIds() {
        try {
            if (dishIdsString != null && !dishIdsString.isEmpty()) {
                return mapper.readValue(dishIdsString, new TypeReference<List<Long>>(){});
            }
        } catch (Exception ignored) {
            // 解析失败时返回空列表
        }
        return new ArrayList<>();
    }
    
    public void setDishIds(List<Long> dishIds) {
        try {
            this.dishIdsString = mapper.writeValueAsString(dishIds);
        } catch (Exception ignored) {
            this.dishIdsString = "[]";
        }
    }
}

