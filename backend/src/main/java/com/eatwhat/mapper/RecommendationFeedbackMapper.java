package com.eatwhat.mapper;
import org.apache.ibatis.annotations.*;
import java.util.*;
@Mapper
public interface RecommendationFeedbackMapper {
    @Insert("INSERT INTO recommendation_feedback(user_id,meal_date,meal_type,dish_key,event_type,workspace_id,plan_version,dish_id,features_json,policy_version,occurred_at) VALUES(#{user},#{date},#{meal},#{key},#{type},#{workspace},#{version},#{dish},#{features},#{policy},#{at}) ON DUPLICATE KEY UPDATE workspace_id=IF(revoked=1,VALUES(workspace_id),workspace_id),plan_version=IF(revoked=1,VALUES(plan_version),plan_version),dish_id=IF(revoked=1,VALUES(dish_id),dish_id),policy_version=IF(revoked=1,VALUES(policy_version),policy_version),occurred_at=IF(revoked=1,VALUES(occurred_at),occurred_at),features_json=IF(revoked=1,VALUES(features_json),features_json),revoked=0")
    int record(Map<String,Object> row);
    @Select("SELECT DATE_FORMAT(meal_date,'%Y-%m-%d') AS mealDate,meal_type AS mealType,dish_key AS dishKey,event_type AS eventType,CAST(features_json AS CHAR) AS featuresJson,occurred_at AS occurredAt FROM recommendation_feedback WHERE user_id=#{user} AND revoked=0 AND occurred_at>=#{since}")
    List<Map<String,Object>> recent(@Param("user") Long user,@Param("since") String since);
    @Update("UPDATE recommendation_feedback SET revoked=1 WHERE user_id=#{user} AND workspace_id=#{workspace} AND plan_version=#{version} AND event_type='single_replaced'")
    int undoReplacement(@Param("user") Long user,@Param("workspace") String workspace,@Param("version") Long version);
    @Delete("DELETE FROM recommendation_feedback WHERE user_id=#{user}") int clear(@Param("user") Long user);
    @Insert("INSERT IGNORE INTO recommendation_learning_reset(user_id,request_id) VALUES(#{user},#{request})") int reset(@Param("user") Long user,@Param("request") String request);
    @Delete("DELETE FROM recommendation_feedback WHERE occurred_at<#{before} LIMIT 500") int purge(@Param("before") String before);
}
