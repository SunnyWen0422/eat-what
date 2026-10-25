package com.eatwhat.mapper;

import com.eatwhat.entity.MealConsumption;
import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Map;

@Mapper
public interface MealConsumptionMapper {
    String COLUMNS = "id,user_id AS userId,DATE_FORMAT(meal_date,'%Y-%m-%d') AS mealDate,meal_type AS mealType,status,revision,source_record_id AS sourceRecordId,planned_snapshot_json AS plannedSnapshotJson,actual_dishes_json AS actualDishesJson";
    @Select("SELECT id FROM users WHERE id=#{userId} FOR UPDATE")
    Long lockUser(@Param("userId") Long userId);
    String RECORD_COLUMNS="ID AS id,USER_ID AS userId,DATE_FORMAT(RECORD_DATE,'%Y-%m-%d') AS recordDateString,MEAL_TYPE AS mealType,RECIPE_NAME AS recipeName,DISH_IDS AS dishIdsString,DISH_DETAILS AS dishDetailsString,revision,target_people AS targetPeople,is_deleted AS isDeleted";
    @Select("SELECT "+RECORD_COLUMNS+" FROM recipe_records WHERE USER_ID=#{userId} AND RECORD_DATE=#{date} AND MEAL_TYPE=#{mealType} AND is_deleted=0")
    com.eatwhat.entity.RecipeRecord record(@Param("userId") Long userId,@Param("date") String date,@Param("mealType") String mealType);
    @Select("SELECT "+RECORD_COLUMNS+" FROM recipe_records WHERE USER_ID=#{userId} AND RECORD_DATE BETWEEN #{start} AND #{end} AND is_deleted=0 ORDER BY RECORD_DATE,MEAL_TYPE")
    List<com.eatwhat.entity.RecipeRecord> records(@Param("userId") Long userId,@Param("start") String start,@Param("end") String end);
    default MealConsumption find(Long userId,String date,String mealType){return com.eatwhat.service.MealRecordProjection.from(record(userId,date,mealType));}
    default List<MealConsumption> range(Long userId,String start,String end){return com.eatwhat.service.MealRecordProjection.from(records(userId,start,end));}
    default int save(MealConsumption value){throw new UnsupportedOperationException("请在日历修改这餐记录");}
    @Select("SELECT request_hash AS requestHash,response_json AS responseJson FROM meal_mutation_log WHERE user_id=#{userId} AND request_id=#{requestId}")
    Map<String,Object> request(@Param("userId") Long userId,@Param("requestId") String requestId);
    @Insert("INSERT INTO meal_mutation_log(user_id,request_id,request_hash,response_json) VALUES(#{userId},#{requestId},#{hash},#{response})")
    int log(@Param("userId") Long userId,@Param("requestId") String requestId,@Param("hash") String hash,@Param("response") String response);
}
