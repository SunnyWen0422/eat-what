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
    @Select("SELECT " + COLUMNS + " FROM meal_consumption WHERE user_id=#{userId} AND meal_date=#{date} AND meal_type=#{mealType}")
    MealConsumption find(@Param("userId") Long userId,@Param("date") String date,@Param("mealType") String mealType);
    @Select("SELECT " + COLUMNS + " FROM meal_consumption WHERE user_id=#{userId} AND meal_date BETWEEN #{start} AND #{end} ORDER BY meal_date,meal_type")
    List<MealConsumption> range(@Param("userId") Long userId,@Param("start") String start,@Param("end") String end);
    @Insert("INSERT INTO meal_consumption(user_id,meal_date,meal_type,status,revision,source_record_id,planned_snapshot_json,actual_dishes_json) VALUES(#{userId},#{mealDate},#{mealType},#{status},#{revision},#{sourceRecordId},#{plannedSnapshotJson},#{actualDishesJson}) ON DUPLICATE KEY UPDATE status=VALUES(status),revision=VALUES(revision),source_record_id=VALUES(source_record_id),planned_snapshot_json=VALUES(planned_snapshot_json),actual_dishes_json=VALUES(actual_dishes_json),updated_at=NOW()")
    @Options(useGeneratedKeys=true,keyProperty="id")
    int save(MealConsumption value);
    @Select("SELECT request_hash AS requestHash,response_json AS responseJson FROM meal_mutation_log WHERE user_id=#{userId} AND request_id=#{requestId}")
    Map<String,Object> request(@Param("userId") Long userId,@Param("requestId") String requestId);
    @Insert("INSERT INTO meal_mutation_log(user_id,request_id,request_hash,response_json) VALUES(#{userId},#{requestId},#{hash},#{response})")
    int log(@Param("userId") Long userId,@Param("requestId") String requestId,@Param("hash") String hash,@Param("response") String response);
}
