package com.eatwhat.mapper;
import com.eatwhat.entity.CustomRecipe;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface RecipeMapper {
    String COLUMNS = "id,name,people,user_id AS userId,dish_ids AS dishIdsString,meal_type AS mealType,create_time AS createTime,version,is_deleted AS isDeleted,dish_snapshots_json AS dishSnapshotsJson";
    @Select("SELECT " + COLUMNS + " FROM custom_recipes WHERE user_id=#{userId} AND is_deleted=0 ORDER BY create_time DESC,id DESC")
    List<CustomRecipe> selectByUserId(@Param("userId") Long userId);
    @Select("SELECT " + COLUMNS + " FROM custom_recipes WHERE id=#{id} AND user_id=#{userId} AND is_deleted=0")
    CustomRecipe selectOwned(@Param("id") Long id,@Param("userId") Long userId);
    @Insert("INSERT INTO custom_recipes(name,people,user_id,dish_ids,meal_type,create_time,version,is_deleted,dish_snapshots_json) VALUES(#{name},#{people},#{userId},#{dishIdsString},#{mealType},NOW(),#{version},0,#{dishSnapshotsJson})")
    @Options(useGeneratedKeys=true,keyProperty="id")
    int insert(CustomRecipe recipe);
    @Update("UPDATE custom_recipes SET name=#{name},people=#{people},dish_ids=#{dishIdsString},dish_snapshots_json=#{dishSnapshotsJson},version=#{version} WHERE id=#{id} AND user_id=#{userId} AND is_deleted=0 AND version=#{version}-1")
    int update(CustomRecipe recipe);
    @Update("UPDATE custom_recipes SET is_deleted=1,version=version+1 WHERE id=#{id} AND user_id=#{userId} AND version=#{version} AND is_deleted=0")
    int delete(@Param("id") Long id,@Param("userId") Long userId,@Param("version") Long version);
}
