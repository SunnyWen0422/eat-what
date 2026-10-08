package com.eatwhat.mapper;
import com.eatwhat.entity.Dish;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PersonalDishMapper {
    String COLUMNS = "ID AS id, NAME AS name, TYPE AS type, CL AS cl, FL AS fl, STEP AS step, " +
        "INGREDIENTS_AMOUNTS AS ingredientsAmounts, STEPS AS steps, STEP_IMAGES AS stepImages, TIPS AS tips, " +
        "TAGS AS tags, CUISINE_CODE AS cuisineCode, TAG_CODES AS tagCodes, COOK_MINUTES AS cookMinutes, " +
        "METADATA_VERSION AS metadataVersion, IMAGE AS image, DIFFICULTY AS difficulty, COOK_TIME AS cookTime, " +
        "METHODS AS methods, KCAL AS kcal, user_id AS userId, is_custom AS isCustom, create_time AS createTime";
    @Select("SELECT " + COLUMNS + " FROM food WHERE ID=#{id} AND ((user_id IS NULL AND COALESCE(IS_PUBLISHED,1)=1) OR user_id=#{userId}) FOR UPDATE")
    Dish lockReadable(@Param("id") Long id,@Param("userId") Long userId);
    @Select("SELECT " + COLUMNS + " FROM food WHERE user_id=#{userId} ORDER BY ID DESC")
    List<Dish> listOwned(@Param("userId") Long userId);
    @Insert("INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,STEPS,STEP_IMAGES,TIPS,TAGS,CUISINE_CODE,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IMAGE,DIFFICULTY,COOK_TIME,METHODS,KCAL,user_id,is_custom) VALUES(#{name},#{type},#{cl},#{fl},#{step},#{ingredientsAmounts},#{steps},#{stepImages},#{tips},#{tags},#{cuisineCode},#{tagCodes},#{cookMinutes},#{metadataVersion},#{image},#{difficulty},#{cookTime},#{methods},#{kcal},#{userId},1)")
    @Options(useGeneratedKeys=true,keyProperty="id")
    int insert(Dish dish);
    @Update("UPDATE food SET NAME=#{name},TYPE=#{type},CL=#{cl},FL=#{fl},STEP=#{step},INGREDIENTS_AMOUNTS=#{ingredientsAmounts},STEPS=#{steps},STEP_IMAGES=#{stepImages},TIPS=#{tips},TAGS=#{tags},CUISINE_CODE=#{cuisineCode},TAG_CODES=#{tagCodes},COOK_MINUTES=#{cookMinutes},METADATA_VERSION=#{metadataVersion},IMAGE=#{image},DIFFICULTY=#{difficulty},COOK_TIME=#{cookTime},METHODS=#{methods},KCAL=#{kcal} WHERE ID=#{id} AND user_id=#{userId} AND is_custom=1")
    int update(Dish dish);
    @Delete("DELETE FROM food WHERE ID=#{id} AND user_id=#{userId} AND is_custom=1")
    int delete(@Param("id") Long id,@Param("userId") Long userId);
}
