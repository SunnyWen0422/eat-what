package com.eatwhat.mapper;

import com.eatwhat.entity.RecipeRecord;
import org.apache.ibatis.annotations.*;
import java.util.Date;
import java.util.List;

/**
 * 菜谱记录数据访问层
 */
@Mapper
public interface RecipeRecordMapper {

    /**
     * 插入菜谱记录
     */
    @Insert("INSERT INTO recipe_records (USER_ID, RECORD_DATE, MEAL_TYPE, RECIPE_NAME, DISH_IDS, DISH_DETAILS, IS_MANUAL, CREATE_TIME, UPDATE_TIME) " +
            "VALUES (#{userId}, #{recordDate,jdbcType=DATE}, #{mealType}, #{recipeName}, #{dishIdsString}, #{dishDetailsString}, #{isManual}, NOW(), NOW()) " +
            "ON DUPLICATE KEY UPDATE " +
            "RECIPE_NAME = VALUES(RECIPE_NAME), " +
            "DISH_IDS = VALUES(DISH_IDS), " +
            "DISH_DETAILS = VALUES(DISH_DETAILS), " +
            "IS_MANUAL = VALUES(IS_MANUAL), " +
            "UPDATE_TIME = NOW()")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(RecipeRecord record);

    /**
     * 根据用户ID和日期查询记录
     * 将日期参数转为字符串 "yyyy-MM-dd" 用于字符串比较，避免 Date + 时区转换导致查询不到当天记录
     */
    @Select("SELECT ID as id, USER_ID as userId, DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') as recordDate, MEAL_TYPE as mealType, " +
            "RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, DISH_DETAILS as dishDetailsString, IS_MANUAL as isManual, " +
            "CREATE_TIME as createTime, UPDATE_TIME as updateTime " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} AND DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') = #{dateString} " +
            "ORDER BY MEAL_TYPE, CREATE_TIME DESC")
    List<RecipeRecord> selectByUserAndDate(@Param("userId") Long userId, @Param("dateString") String dateString);

    /**
     * 根据用户ID查询日期范围内的记录
     */
    @Select("SELECT DISTINCT RECORD_DATE as recordDate " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} " +
            "AND RECORD_DATE >= #{startDate} " +
            "AND RECORD_DATE <= #{endDate} " +
            "ORDER BY RECORD_DATE")
    List<Date> selectRecordDatesByUserAndRange(@Param("userId") Long userId,
                                              @Param("startDate") Date startDate,
                                              @Param("endDate") Date endDate);

    /**
     * 根据用户ID查询日期范围内的完整记录（用于统计）
     */
    @Select("SELECT ID as id, USER_ID as userId, RECORD_DATE as recordDate, MEAL_TYPE as mealType, " +
            "RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, DISH_DETAILS as dishDetailsString, IS_MANUAL as isManual, " +
            "CREATE_TIME as createTime, UPDATE_TIME as updateTime " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} " +
            "AND RECORD_DATE >= #{startDate} " +
            "AND RECORD_DATE <= #{endDate} " +
            "ORDER BY RECORD_DATE, MEAL_TYPE")
    List<RecipeRecord> selectRecordsByUserAndRange(@Param("userId") Long userId,
                                                   @Param("startDate") Date startDate,
                                                   @Param("endDate") Date endDate);

    /**
     * 更新菜谱记录
     */
    @Update("UPDATE recipe_records SET RECIPE_NAME = #{recipeName}, DISH_IDS = #{dishIdsString}, " +
            "DISH_DETAILS = #{dishDetailsString}, IS_MANUAL = #{isManual}, UPDATE_TIME = NOW() " +
            "WHERE ID = #{id} AND USER_ID = #{userId}")
    int update(RecipeRecord record);

    /**
     * 删除菜谱记录
     */
    @Delete("DELETE FROM recipe_records WHERE ID = #{id} AND USER_ID = #{userId}")
    int delete(@Param("id") Long id, @Param("userId") Long userId);

    /**
     * 删除指定日期和餐次的记录
     */
    @Delete("DELETE FROM recipe_records " +
            "WHERE USER_ID = #{userId} AND DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') = #{dateString} AND MEAL_TYPE = #{mealType}")
    int deleteByDateAndMeal(@Param("userId") Long userId, @Param("dateString") String dateString, @Param("mealType") String mealType);
}
