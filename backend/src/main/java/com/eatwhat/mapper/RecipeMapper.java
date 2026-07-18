package com.eatwhat.mapper;

import com.eatwhat.entity.CustomRecipe;
import org.apache.ibatis.annotations.*;
import java.util.List;

/**
 * 菜谱数据访问层
 */
@Mapper
public interface RecipeMapper {
    
    @Select("SELECT id, name, people, user_id as userId, dish_ids as dishIdsString, " +
            "meal_type as mealType, create_time as createTime " +
            "FROM custom_recipes WHERE user_id = #{userId} ORDER BY create_time DESC")
    List<CustomRecipe> selectByUserId(@Param("userId") Long userId);
    
    @Insert("INSERT INTO custom_recipes (name, people, user_id, dish_ids, meal_type, create_time) " +
            "VALUES (#{name}, #{people}, #{userId}, #{dishIdsString}, #{mealType}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CustomRecipe recipe);
    
    @Delete("DELETE FROM custom_recipes WHERE id = #{id} AND user_id = #{userId}")
    int delete(@Param("id") Long id, @Param("userId") Long userId);
    
    @Select("SELECT id, name, people, user_id as userId, dish_ids as dishIdsString, " +
            "meal_type as mealType, create_time as createTime " +
            "FROM custom_recipes WHERE id = #{id}")
    CustomRecipe selectById(@Param("id") Long id);
}

