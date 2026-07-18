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
    @Select("SELECT ID as id, NAME as name, TYPE as type " +
            "FROM food WHERE TYPE = #{type} ORDER BY ID DESC LIMIT #{limit} OFFSET #{offset}")
    List<Dish> selectDishesByTypePage(@Param("type") String type,
                                       @Param("limit") int limit,
                                       @Param("offset") int offset);

    /**
     * 按类型获取菜品总数
     */
    @Select("SELECT COUNT(*) FROM food WHERE TYPE = #{type}")
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
            "0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food ORDER BY ID DESC")
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
            "0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food WHERE ID = #{id}")
    Dish selectById(@Param("id") Long id);

    /**
     * 插入自定义菜品
     */
    @Insert("INSERT INTO food (NAME, TYPE, CL, FL, STEP, user_id) " +
            "VALUES (#{name}, #{type}, #{cl}, #{fl}, #{step}, #{userId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Dish dish);

    /**
     * 获取用户自定义菜品。
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "1 as isCustom, user_id as userId, NOW() as createTime " +
            "FROM food WHERE user_id = #{userId} ORDER BY ID DESC")
    List<Dish> selectCustomByUser(@Param("userId") Long userId);

    @Update("UPDATE food SET user_id = NULL WHERE ID = #{dishId} AND user_id = #{userId}")
    int clearCustomDishOwner(@Param("userId") Long userId, @Param("dishId") Long dishId);

    /**
     * 搜索菜品（按关键词 + 可选类型）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "'' as tags, 0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food " +
            "WHERE NAME LIKE CONCAT('%', #{keyword}, '%') " +
            "AND TYPE = #{type} " +
            "ORDER BY ID DESC")
    List<Dish> searchDishes(@Param("keyword") String keyword,
                           @Param("type") String type);

    /**
     * 搜索菜品（仅按关键词，不限类型）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "CL as cl, FL as fl, STEP as step, " +
            "'' as tags, 0 as isCustom, NULL as userId, " +
            "NOW() as createTime " +
            "FROM food " +
            "WHERE NAME LIKE CONCAT('%', #{keyword}, '%') " +
            "ORDER BY ID DESC")
    List<Dish> searchDishesByKeyword(@Param("keyword") String keyword);

    /**
     * 根据IDs批量查询（推荐路径，不含image等大字段）
     */
    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, ",
        "TAGS as tags, ",
        "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step ",
        "FROM food WHERE ID IN ",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>",
        "#{id}",
        "</foreach>",
        "</script>"
    })
    List<Dish> selectByIds(@Param("ids") List<Long> ids);

    /**
     * 获取菜品总数
     */
    @Select("SELECT COUNT(*) FROM food")
    int countAll();

    /**
     * 按类型获取菜品（轻量版，不含image，支持limit）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "TAGS as tags, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step " +
            "FROM food WHERE TYPE = #{type} ORDER BY ID DESC LIMIT #{limit}")
    List<Dish> selectDishesLiteByType(@Param("type") String type,
                                       @Param("limit") int limit);

    /**
     * 获取所有菜品（轻量版，不含image）
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, " +
            "TAGS as tags, " +
            "INGREDIENTS_AMOUNTS as ingredientsAmounts, STEP as step " +
            "FROM food ORDER BY ID DESC")
    List<Dish> selectAllDishesLite();

    /**
     * 按类型获取所有菜品ID（仅ID，极快）
     */
    @Select("SELECT ID as id FROM food WHERE TYPE = #{type}")
    List<Long> selectIdsByType(@Param("type") String type);

    /**
     * 按类型获取指定ID范围的菜品ID（排除指定ID列表）
     */
    @Select({
        "<script>",
        "SELECT ID as id FROM food WHERE TYPE = #{type} ",
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
