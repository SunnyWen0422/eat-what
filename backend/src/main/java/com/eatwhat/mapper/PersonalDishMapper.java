package com.eatwhat.mapper;
import com.eatwhat.entity.Dish;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PersonalDishMapper {
    String COLUMNS = "ID as id, RECIPE_JSON as recipeJson, NAME AS name, TYPE AS type, CL AS cl, FL AS fl, STEP AS step, " +
        "INGREDIENTS_AMOUNTS AS ingredientsAmounts, STEPS AS steps, STEP_IMAGES AS stepImages, TIPS AS tips, " +
        "TAGS AS tags, CUISINE_CODE AS cuisineCode, TAG_CODES AS tagCodes, COOK_MINUTES AS cookMinutes, " +
        "METADATA_VERSION AS metadataVersion, IMAGE AS image, DIFFICULTY AS difficulty, COOK_TIME AS cookTime, " +
        "METHODS AS methods, KCAL AS kcal, user_id AS userId, is_custom AS isCustom, create_time AS createTime";
    @Select("SELECT id, document AS recipeJson, owner_id AS userId, is_published AS isPublished, CASE WHEN owner_id IS NULL THEN 0 ELSE 1 END AS isCustom FROM catalog_recipe WHERE id=#{id} AND ((owner_id IS NULL AND is_published=1) OR owner_id=#{userId}) FOR UPDATE")
    Dish lockReadable(@Param("id") Long id,@Param("userId") Long userId);
    @Select("SELECT id, document AS recipeJson, owner_id AS userId, is_published AS isPublished, 1 AS isCustom, created_at AS createTime FROM catalog_recipe WHERE owner_id=#{userId} ORDER BY id DESC")
    List<Dish> listOwned(@Param("userId") Long userId);
    @Insert("INSERT INTO catalog_recipe(owner_id,is_published,document) VALUES(#{userId},1,#{recipeJson})")
    @Options(useGeneratedKeys=true,keyProperty="id")
    int insert(Dish dish);
    @Update("UPDATE catalog_recipe SET document=#{recipeJson} WHERE id=#{id} AND owner_id=#{userId}")
    int update(Dish dish);
    @Delete("DELETE FROM catalog_recipe WHERE id=#{id} AND owner_id=#{userId}")
    int delete(@Param("id") Long id,@Param("userId") Long userId);
}
