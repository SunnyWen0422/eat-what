package com.eatwhat.mapper;

import com.eatwhat.entity.FavoriteDish;
import org.apache.ibatis.annotations.*;
import java.util.List;

/**
 * 收藏菜品数据访问层
 */
@Mapper
public interface FavoriteDishMapper {

    /**
     * 添加收藏
     */
    @Insert("INSERT INTO favorite_dishes (USER_ID, DISH_ID, CREATE_TIME) " +
            "VALUES (#{userId}, #{dishId}, NOW()) " +
            "ON DUPLICATE KEY UPDATE CREATE_TIME = NOW()")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(FavoriteDish favoriteDish);

    /**
     * 取消收藏
     */
    @Delete("DELETE FROM favorite_dishes WHERE USER_ID = #{userId} AND DISH_ID = #{dishId}")
    int delete(@Param("userId") Long userId, @Param("dishId") Long dishId);

    /**
     * 查询用户是否收藏了某道菜
     */
    @Select("SELECT COUNT(*) FROM favorite_dishes WHERE USER_ID = #{userId} AND DISH_ID = #{dishId}")
    int isFavorite(@Param("userId") Long userId, @Param("dishId") Long dishId);

    /**
     * 获取用户的所有收藏菜品ID
     */
    @Select("SELECT DISH_ID FROM favorite_dishes WHERE USER_ID = #{userId} ORDER BY CREATE_TIME DESC")
    List<Long> selectDishIdsByUser(@Param("userId") Long userId);

    /**
     * 获取用户的收藏列表（带菜品信息）
     * 注意：food表的字段都是大写，如ID, NAME, TYPE等
     * MyBatis配置了map-underscore-to-camel-case=true，会自动转换下划线到驼峰
     */
    @Select("SELECT " +
            "f.id, f.name, f.type, " +
            "f.cl, f.fl, f.step, " +
            "f.tags, f.image, f.difficulty, " +
            "f.cook_time as cookTime, " +
            "f.ingredients_amounts as ingredientsAmounts, " +
            "f.steps, f.step_images as stepImages, " +
            "f.tips, f.methods, f.kcal, " +
            "fd.CREATE_TIME as createTime " +
            "FROM favorite_dishes fd " +
            "JOIN food f ON fd.DISH_ID = f.id " +
            "WHERE fd.USER_ID = #{userId} " +
            "ORDER BY fd.CREATE_TIME DESC")
    @Results({
        @Result(property = "dish.id", column = "id"),
        @Result(property = "dish.name", column = "name"),
        @Result(property = "dish.type", column = "type"),
        @Result(property = "dish.cl", column = "cl"),
        @Result(property = "dish.fl", column = "fl"),
        @Result(property = "dish.step", column = "step"),
        @Result(property = "dish.tags", column = "tags"),
        @Result(property = "dish.image", column = "image"),
        @Result(property = "dish.difficulty", column = "difficulty"),
        @Result(property = "dish.cookTime", column = "cookTime"),
        @Result(property = "dish.ingredientsAmounts", column = "ingredientsAmounts"),
        @Result(property = "dish.steps", column = "steps"),
        @Result(property = "dish.stepImages", column = "stepImages"),
        @Result(property = "dish.tips", column = "tips"),
        @Result(property = "dish.methods", column = "methods"),
        @Result(property = "dish.kcal", column = "kcal"),
        @Result(property = "createTime", column = "createTime")
    })
    List<FavoriteDish> selectFavoritesByUser(@Param("userId") Long userId);
}
