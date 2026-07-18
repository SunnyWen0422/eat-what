package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.Date;

/**
 * 用户收藏菜品实体类
 */
@Data
public class FavoriteDish {

    @JsonProperty("id")
    private Long id;

    @JsonProperty("userId")
    private Long userId;

    @JsonProperty("dishId")
    private Long dishId;

    @JsonProperty("createTime")
    private Date createTime;

    // 关联的菜品信息（查询时填充）
    @JsonProperty("dish")
    private Dish dish;
}
