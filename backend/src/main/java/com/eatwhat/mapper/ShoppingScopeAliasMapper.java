package com.eatwhat.mapper;

import org.apache.ibatis.annotations.*;

@Mapper
public interface ShoppingScopeAliasMapper {
 @Select("SELECT id FROM controlled_tool_task WHERE user_id=#{user} AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].tool'))='save_meal_to_target' AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].status'))='completed' AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].result.targetDate'))=#{date} AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].result.targetMealType'))=#{meal} AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.steps[0].result.targetPlanRevision')) AS UNSIGNED)=#{revision} ORDER BY updated_at DESC LIMIT 1")
 String savedCalendarTask(@Param("user") Long user,@Param("date") String date,@Param("meal") String meal,@Param("revision") Long revision);
 @Select({"<script>","SELECT "+PersonalDishMapper.COLUMNS+" FROM food WHERE ID IN",
  "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>",
  "AND ((user_id IS NULL AND COALESCE(IS_PUBLISHED,1)=1) OR user_id=#{user}) FOR UPDATE","</script>"})
 java.util.List<com.eatwhat.entity.Dish> lockDishes(@Param("user") Long user,@Param("ids") java.util.List<Long> ids);
 @Select({"<script>","SELECT dish_id AS dishId,profile_json AS profileJson FROM dish_quality_profile WHERE dish_id IN",
  "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>","FOR UPDATE","</script>"})
 java.util.List<DishQualityMapper.Row> lockProfiles(@Param("ids") java.util.List<Long> ids);
 @Select("SELECT purchase_scope_id FROM shopping_scope_aliases WHERE user_id=#{user} AND alias_key=#{alias}")
 String find(@Param("user") Long user,@Param("alias") String alias);
 @Insert("INSERT INTO shopping_scope_aliases(user_id,alias_key,purchase_scope_id) VALUES(#{user},#{alias},#{scope}) ON DUPLICATE KEY UPDATE alias_key=VALUES(alias_key)")
 int insert(@Param("user") Long user,@Param("alias") String alias,@Param("scope") String scope);
}
