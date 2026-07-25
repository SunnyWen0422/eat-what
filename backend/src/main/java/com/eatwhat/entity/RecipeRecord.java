package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 用户菜谱记录实体类 - 记录用户每天的餐次选择
 */
@Data
public class RecipeRecord {

    private static final Logger log = LoggerFactory.getLogger(RecipeRecord.class);

    @JsonProperty("id")
    private Long id;

    @JsonProperty("userId")
    private Long userId;

    @JsonProperty("recordDate")
    @JsonFormat(pattern = "yyyy-MM-dd", timezone = "GMT+8")
    private Date recordDate;  // 记录日期
    
    // 用于接收前端发送的字符串格式日期（不持久化到数据库）
    @JsonProperty("recordDateString")
    private String recordDateString;

    @JsonProperty("mealType")
    private String mealType;  // breakfast/lunch/dinner

    @JsonProperty("recipeName")
    private String recipeName;  // 菜谱名称

    @JsonProperty("dishIdsString")
    private String dishIdsString;  // 菜品ID列表（JSON格式）

    @JsonProperty("dishIds")
    private List<Long> dishIds;  // 兼容前端的数组格式

    @JsonProperty("dishNames")
    private String dishNames;  // 查询时动态填充的菜品名称，逗号分隔

    @JsonProperty("dishDetailsString")
    private String dishDetailsString;  // 菜品详情JSON字符串

    @JsonProperty("dishDetails")
    private List<Dish> dishDetails;  // 菜品详情列表（用于前端展示）

    @JsonProperty("isManual")
    private Integer isManual;  // 0-推荐菜谱，1-手动输入

    @JsonProperty("createTime")
    private Date createTime;

    @JsonProperty("updateTime")
    private Date updateTime;

    private static final ObjectMapper mapper = new ObjectMapper();


    // 转换为List<Long>
    public List<Long> getDishIds() {
        if (dishIds != null) {
            return dishIds;
        }

        try {
            if (dishIdsString != null && !dishIdsString.isEmpty()) {
                JsonNode root = mapper.readTree(dishIdsString);
                List<Long> parsed = new ArrayList<>();
                if (root.isArray()) {
                    for (JsonNode item : root) {
                        if (item.isIntegralNumber()) {
                            parsed.add(item.longValue());
                        } else if (item.isTextual()) {
                            try {
                                parsed.add(Long.parseLong(item.asText().trim()));
                            } catch (NumberFormatException ignored) {
                                log.warn("Skipping malformed legacy dish ID in recipe record {}", id);
                            }
                        }
                    }
                }
                this.dishIds = parsed;
                return this.dishIds;
            }
        } catch (Exception error) {
            log.warn("Skipping malformed legacy dish ID list in recipe record {}", id);
        }
        this.dishIds = new ArrayList<>();
        return this.dishIds;
    }

    // 从List<Long>转换
    public void setDishIds(List<Long> dishIds) {
        try {
            if (dishIds != null) {
                List<Long> cleanedIds = new ArrayList<>();
                for (Object id : dishIds) {
                    if (id != null) {
                        if (id instanceof Long) {
                            cleanedIds.add((Long) id);
                        } else if (id instanceof Number) {
                            cleanedIds.add(((Number) id).longValue());
                        } else if (id instanceof String) {
                            try {
                                cleanedIds.add(Long.parseLong((String) id));
                            } catch (NumberFormatException ignored) {
                                // 跳过无效的ID
                            }
                        }
                    }
                }
                this.dishIds = cleanedIds;
            } else {
                this.dishIds = new ArrayList<>();
            }
            this.dishIdsString = mapper.writeValueAsString(this.dishIds);
        } catch (Exception ignored) {
            this.dishIds = new ArrayList<>();
            this.dishIdsString = "[]";
        }
    }

    // 获取菜品详情列表
    public List<Dish> getDishDetails() {
        if (dishDetails != null) {
            return dishDetails;
        }
        try {
            if (dishDetailsString != null && !dishDetailsString.isEmpty()) {
                this.dishDetails = mapper.readValue(dishDetailsString, new TypeReference<List<Dish>>(){});
                return this.dishDetails;
            }
        } catch (Exception ignored) {
            // 解析失败时返回空列表
        }
        this.dishDetails = new ArrayList<>();
        return this.dishDetails;
    }

    // 设置菜品详情列表
    public void setDishDetails(List<Dish> dishDetails) {
        try {
            this.dishDetails = dishDetails != null ? dishDetails : new ArrayList<>();
            this.dishDetailsString = mapper.writeValueAsString(this.dishDetails);
        } catch (Exception ignored) {
            this.dishDetails = new ArrayList<>();
            this.dishDetailsString = "[]";
        }
    }
}
