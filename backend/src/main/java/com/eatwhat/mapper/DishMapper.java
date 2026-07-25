package com.eatwhat.mapper;

import com.eatwhat.entity.Dish;
import org.apache.ibatis.annotations.*;
import java.util.List;

/**
 * 菜品数据访问层
 */
@Mapper
public interface DishMapper {

    /**
     * 按类型获取菜品（分页）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, CUISINE_CODE as cuisineCode, " +
            "TAG_CODES as tagCodes, COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion " +
            "FROM food WHERE TYPE = #{type} AND user_id IS NULL ORDER BY ID DESC LIMIT #{limit} OFFSET #{offset}")
    List<Dish> selectDishesByTypePage(@Param("type") String type,
                                       @Param("limit") int limit,
                                       @Param("offset") int offset);

    /**
     * 按类型获取菜品总数
     */
    @Select("SELECT COUNT(*) FROM food WHERE TYPE = #{type} AND user_id IS NULL")
    int countByType(@Param("type") String type);

    /**
     * 获取所有菜品（无过滤）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step, " +
            "TAGS as tags, IMAGE as image, DIFFICULTY as difficulty, " +
            "COOK_TIME as cookTime, " +
            "STEPS as steps, STEP_IMAGES as stepImages, TIPS as tips, " +
            "METHODS as methods, KCAL as kcal, " +
            "CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, COOK_MINUTES as cookMinutes, " +
            "METADATA_VERSION as metadataVersion, " +
            "0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food WHERE user_id IS NULL ORDER BY ID DESC")
    List<Dish> selectAllDishes();

    /**
     * 根据ID查询菜品
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "TAGS as tags, IMAGE as image, DIFFICULTY as difficulty, " +
            "COOK_TIME as cookTime, INGREDIENTS_AMOUNTS as ingredientsAmounts, " +
            "STEPS as steps, STEP_IMAGES as stepImages, TIPS as tips, " +
            "METHODS as methods, KCAL as kcal, " +
            "CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, COOK_MINUTES as cookMinutes, " +
            "METADATA_VERSION as metadataVersion, " +
            "0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food WHERE ID = #{id}")
    Dish selectById(@Param("id") Long id);

    @Select("SELECT ID as id, NAME as name, TYPE as type, CL as cl, FL as fl, STEP as step, " +
            "TAGS as tags, IMAGE as image, DIFFICULTY as difficulty, COOK_TIME as cookTime, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEPS as steps, STEP_IMAGES as stepImages, TIPS as tips, " +
            "METHODS as methods, KCAL as kcal, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, " +
            "CASE WHEN user_id IS NULL THEN 0 ELSE 1 END as isCustom, user_id as userId, create_time as createTime " +
            "FROM food WHERE ID = #{id} AND (user_id IS NULL OR user_id = #{userId})")
    Dish selectByIdForUser(@Param("id") Long id, @Param("userId") Long userId);

    /**
     * 插入自定义菜品
     */
    @Insert("INSERT INTO food (NAME, TYPE, CL, FL, STEP, TAGS, CUISINE_CODE, TAG_CODES, COOK_MINUTES, METADATA_VERSION, user_id, is_custom) " +
            "VALUES (#{name}, #{type}, #{cl}, #{fl}, #{step}, #{tags}, #{cuisineCode}, #{tagCodes}, #{cookMinutes}, #{metadataVersion}, #{userId}, 1)")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Dish dish);

    /**
     * 获取用户自定义菜品。
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, " +
            "1 as isCustom, user_id as userId, create_time as createTime " +
            "FROM food WHERE user_id = #{userId} ORDER BY ID DESC")
    List<Dish> selectCustomByUser(@Param("userId") Long userId);

    @Delete("DELETE FROM food WHERE ID = #{dishId} AND user_id = #{userId} AND is_custom = 1")
    int deleteCustomDish(@Param("userId") Long userId, @Param("dishId") Long dishId);

    /**
     * 搜索菜品（按关键词 + 可选类型）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, 0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food " +
            "WHERE NAME LIKE CONCAT('%', #{keyword}, '%') " +
            "AND TYPE = #{type} " +
            "AND user_id IS NULL " +
            "ORDER BY ID DESC")
    List<Dish> searchDishes(@Param("keyword") String keyword,
                           @Param("type") String type);

    /**
     * 搜索菜品（仅按关键词，不限类型）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, 0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food " +
            "WHERE NAME LIKE CONCAT('%', #{keyword}, '%') " +
            "AND user_id IS NULL " +
            "ORDER BY ID DESC")
    List<Dish> searchDishesByKeyword(@Param("keyword") String keyword);

    /**
     * 根据IDs批量查询（推荐路径，不含image等大字段）
     */
    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, ",
        "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, ",
        "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, ",
        "CL as cl, INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step ",
        "FROM food WHERE ID IN ",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>",
        "#{id}",
        "</foreach>",
        "</script>"
    })
    List<Dish> selectByIds(@Param("ids") List<Long> ids);

    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, TAGS as tags, ",
        "CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, COOK_MINUTES as cookMinutes, ",
        "METADATA_VERSION as metadataVersion, CL as cl, INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step ",
        "FROM food WHERE (user_id IS NULL OR user_id = #{userId}) AND ID IN ",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>",
        "</script>"
    })
    List<Dish> selectByIdsForUser(@Param("ids") List<Long> ids, @Param("userId") Long userId);

    /**
     * 获取菜品总数
     */
    @Select("SELECT COUNT(*) FROM food")
    int countAll();

    @Select("SELECT COUNT(*) FROM food WHERE CUISINE_CODE = #{code} AND user_id IS NULL")
    int countByCuisineCode(@Param("code") String code);

    @Select("SELECT COUNT(*) FROM food WHERE FIND_IN_SET(#{code}, TAG_CODES) > 0 AND user_id IS NULL")
    int countByTagCode(@Param("code") String code);

    /**
     * 按类型获取菜品（轻量版，不含image，支持limit）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step " +
            "FROM food WHERE TYPE = #{type} AND user_id IS NULL ORDER BY ID DESC LIMIT #{limit}")
    List<Dish> selectDishesLiteByType(@Param("type") String type,
                                       @Param("limit") int limit);

    /**
     * 获取所有菜品（轻量版，不含image）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "TAGS as tags, CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, " +
            "COOK_MINUTES as cookMinutes, METADATA_VERSION as metadataVersion, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step " +
            "FROM food WHERE user_id IS NULL ORDER BY ID DESC")
    List<Dish> selectAllDishesLite();

    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, CL as cl, STEP as step, ",
        "TAGS as tags, IMAGE as image, DIFFICULTY as difficulty, COOK_TIME as cookTime, ",
        "INGREDIENTS_AMOUNTS as ingredientsAmounts, METHODS as methods, KCAL as kcal, ",
        "CUISINE_CODE as cuisineCode, TAG_CODES as tagCodes, COOK_MINUTES as cookMinutes, ",
        "METADATA_VERSION as metadataVersion, CASE WHEN user_id IS NULL THEN 0 ELSE 1 END as isCustom, ",
        "user_id as userId, create_time as createTime ",
        "FROM food WHERE (user_id IS NULL OR user_id = #{userId}) ",
        "<if test='type != null'>AND TYPE = #{type} </if>",
        "<if test='keyword != null'>AND NAME LIKE CONCAT('%', #{keyword}, '%') </if>",
        "<if test='cuisineCodes != null and cuisineCodes.size() > 0'>",
        "AND CUISINE_CODE IN ",
        "<foreach item='code' collection='cuisineCodes' open='(' separator=',' close=')'>#{code}</foreach>",
        "</if>",
        "<if test='includeTagCodes != null and includeTagCodes.size() > 0'>",
        "AND (",
        "<foreach item='code' collection='includeTagCodes' separator=' OR '>FIND_IN_SET(#{code}, TAG_CODES) &gt; 0</foreach>",
        ") ",
        "</if>",
        "<if test='maxCookMinutes != null'>AND COOK_MINUTES IS NOT NULL AND COOK_MINUTES &lt;= #{maxCookMinutes} </if>",
        "ORDER BY ID DESC",
        "</script>"
    })
    List<Dish> selectFilteredCandidates(@Param("userId") Long userId,
                                        @Param("type") String type,
                                        @Param("keyword") String keyword,
                                        @Param("cuisineCodes") List<String> cuisineCodes,
                                        @Param("includeTagCodes") List<String> includeTagCodes,
                                        @Param("maxCookMinutes") Integer maxCookMinutes);

    /**
     * 按类型获取所有菜品ID（仅ID，极快）
     */
    @Select("SELECT ID as id FROM food WHERE TYPE = #{type} AND user_id IS NULL")
    List<Long> selectIdsByType(@Param("type") String type);

    @Select("SELECT ID as id FROM food WHERE TYPE = #{type} AND (user_id IS NULL OR user_id = #{userId})")
    List<Long> selectIdsByTypeForUser(@Param("type") String type, @Param("userId") Long userId);

    /**
     * 按类型获取指定ID范围的菜品ID（排除指定ID列表）
     */
    @Select({
        "<script>",
        "SELECT ID as id FROM food WHERE TYPE = #{type} AND user_id IS NULL ",
        "<if test='excludeIds != null and excludeIds.size() > 0'>",
        "AND ID NOT IN ",
        "<foreach item='id' collection='excludeIds' open='(' separator=',' close=')'>",
        "#{id}",
        "</foreach>",
        "</if>",
        "ORDER BY ID",
        "</script>"
    })
    List<Long> selectIdsByTypeExclude(@Param("type") String type, @Param("excludeIds") List<Long> excludeIds);
}
