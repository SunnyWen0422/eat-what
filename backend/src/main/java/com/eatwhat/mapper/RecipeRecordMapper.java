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

    @Select("SELECT id FROM users WHERE id=#{userId} FOR UPDATE")
    Long lockUser(@Param("userId") Long userId);

    @Select("SELECT ID as id, USER_ID as userId, RECORD_DATE as recordDate, DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') as recordDateString, MEAL_TYPE as mealType, RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, revision, record_origin as recordOrigin, target_people as targetPeople FROM recipe_records WHERE ID=#{id} AND USER_ID=#{userId} AND is_deleted=0")
    RecipeRecord findOwned(@Param("id") Long id,@Param("userId") Long userId);

    /**
     * 插入菜谱记录
     */
    @Insert("INSERT INTO recipe_records (USER_ID, RECORD_DATE, MEAL_TYPE, RECIPE_NAME, DISH_IDS, DISH_DETAILS, IS_MANUAL, CREATE_TIME, UPDATE_TIME, record_origin, target_people) " +
            "VALUES (#{userId}, #{recordDateString,jdbcType=VARCHAR}, #{mealType}, #{recipeName}, #{dishIdsString}, #{dishDetailsString}, #{isManual}, NOW(), NOW(), 'manual', #{targetPeople}) " +
            "ON DUPLICATE KEY UPDATE " +
            "RECIPE_NAME = VALUES(RECIPE_NAME), " +
            "DISH_IDS = VALUES(DISH_IDS), " +
            "DISH_DETAILS = VALUES(DISH_DETAILS), " +
            "IS_MANUAL = VALUES(IS_MANUAL), target_people = VALUES(target_people), " +
            "revision = revision + 1, record_origin = 'manual', is_deleted = 0, " +
            "UPDATE_TIME = NOW()")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(RecipeRecord record);

    /**
     * Insert only when the user/date/meal unique key is still free.  The
     * assistant uses this variant so a stale confirmation can never overwrite
     * a calendar entry created on another device.
     */
    @Insert("INSERT INTO recipe_records (USER_ID, RECORD_DATE, MEAL_TYPE, RECIPE_NAME, DISH_IDS, DISH_DETAILS, IS_MANUAL, CREATE_TIME, UPDATE_TIME, record_origin, target_people) " +
            "VALUES (#{userId}, #{recordDateString,jdbcType=VARCHAR}, #{mealType}, #{recipeName}, #{dishIdsString}, #{dishDetailsString}, #{isManual}, NOW(), NOW(), 'manual', #{targetPeople}) " +
            "ON DUPLICATE KEY UPDATE ID = ID")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIfAbsent(RecipeRecord record);

    /**
     * 根据用户ID和日期查询记录
     * 将日期参数转为字符串 "yyyy-MM-dd" 用于字符串比较，避免 Date + 时区转换导致查询不到当天记录
     */
    @Select("SELECT ID as id, USER_ID as userId, RECORD_DATE as recordDate, DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') as recordDateString, MEAL_TYPE as mealType, " +
            "RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, DISH_DETAILS as dishDetailsString, IS_MANUAL as isManual, " +
            "CREATE_TIME as createTime, UPDATE_TIME as updateTime, revision, record_origin as recordOrigin, target_people as targetPeople " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} AND is_deleted=0 AND DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') = #{dateString} " +
            "ORDER BY MEAL_TYPE, CREATE_TIME DESC")
    List<RecipeRecord> selectByUserAndDate(@Param("userId") Long userId, @Param("dateString") String dateString);

    /**
     * 根据用户ID查询日期范围内的记录
     */
    @Select("SELECT DISTINCT RECORD_DATE as recordDate " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} AND is_deleted=0 " +
            "AND RECORD_DATE >= #{startDate} " +
            "AND RECORD_DATE <= #{endDate} " +
            "ORDER BY RECORD_DATE")
    List<Date> selectRecordDatesByUserAndRange(@Param("userId") Long userId,
                                              @Param("startDate") String startDate,
                                              @Param("endDate") String endDate);

    /**
     * 根据用户ID查询日期范围内的完整记录（用于统计）
     */
    @Select("SELECT ID as id, USER_ID as userId, RECORD_DATE as recordDate, DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') as recordDateString, MEAL_TYPE as mealType, " +
            "RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, DISH_DETAILS as dishDetailsString, IS_MANUAL as isManual, " +
            "CREATE_TIME as createTime, UPDATE_TIME as updateTime, revision, record_origin as recordOrigin, target_people as targetPeople " +
            "FROM recipe_records " +
            "WHERE USER_ID = #{userId} AND is_deleted=0 " +
            "AND RECORD_DATE >= #{startDate} " +
            "AND RECORD_DATE <= #{endDate} " +
            "ORDER BY RECORD_DATE, MEAL_TYPE")
    List<RecipeRecord> selectRecordsByUserAndRange(@Param("userId") Long userId,
                                                   @Param("startDate") String startDate,
                                                   @Param("endDate") String endDate);

    /**
     * 更新菜谱记录
     */
    @Update("UPDATE recipe_records SET RECIPE_NAME = #{recipeName}, DISH_IDS = #{dishIdsString}, " +
            "DISH_DETAILS = #{dishDetailsString}, IS_MANUAL = #{isManual}, target_people = #{targetPeople}, UPDATE_TIME = NOW(), revision = revision + 1, record_origin = 'manual' " +
            "WHERE ID = #{id} AND USER_ID = #{userId} AND is_deleted=0")
    int update(RecipeRecord record);

    /**
     * 删除菜谱记录
     */
    @Update("UPDATE recipe_records SET is_deleted=1,revision=revision+1,UPDATE_TIME=NOW() WHERE ID = #{id} AND USER_ID = #{userId} AND is_deleted=0")
    int delete(@Param("id") Long id, @Param("userId") Long userId);

    /**
     * 删除指定日期和餐次的记录
     */
    @Update("UPDATE recipe_records SET is_deleted=1,revision=revision+1,UPDATE_TIME=NOW() " +
            "WHERE USER_ID = #{userId} AND is_deleted=0 AND DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') = #{dateString} AND MEAL_TYPE = #{mealType}")
    int deleteByDateAndMeal(@Param("userId") Long userId, @Param("dateString") String dateString, @Param("mealType") String mealType);
    @Select("SELECT ID AS id,USER_ID AS userId,DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') AS recordDateString,MEAL_TYPE AS mealType,RECIPE_NAME AS recipeName,DISH_IDS AS dishIdsString,DISH_DETAILS AS dishDetailsString,IS_MANUAL AS isManual,target_people AS targetPeople,record_origin AS recordOrigin,revision,is_deleted AS isDeleted FROM recipe_records WHERE USER_ID=#{userId} AND RECORD_DATE=#{date} AND MEAL_TYPE=#{meal}")
    RecipeRecord findSlot(@Param("userId") Long userId,@Param("date") String date,@Param("meal") String meal);

    @Select("SELECT ID as id, USER_ID as userId, RECORD_DATE as recordDate, DATE_FORMAT(RECORD_DATE, '%Y-%m-%d') as recordDateString, MEAL_TYPE as mealType, RECIPE_NAME as recipeName, DISH_IDS as dishIdsString, DISH_DETAILS as dishDetailsString, IS_MANUAL as isManual, revision, record_origin as recordOrigin, target_people as targetPeople FROM recipe_records WHERE USER_ID=#{userId} AND is_deleted=0 AND RECORD_DATE BETWEEN #{start} AND #{end} ORDER BY RECORD_DATE, MEAL_TYPE")
    List<RecipeRecord> selectRangeDays(@Param("userId") Long userId,@Param("start") String start,@Param("end") String end);

    @Select("SELECT DATE_FORMAT(RECORD_DATE,'%Y-%m-%d') AS recordDateString,MEAL_TYPE AS mealType,revision FROM recipe_records WHERE USER_ID=#{userId} AND RECORD_DATE BETWEEN #{start} AND #{end}")
    List<RecipeRecord> slotRevisions(@Param("userId") Long userId,@Param("start") String start,@Param("end") String end);
}
