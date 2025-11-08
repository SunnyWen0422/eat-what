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
     * 获取所有菜品
     */
    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, CALORIE as calories, ",
        "PROTEIN as protein, METERIAL as material, STEP as steps, ",
        "TAGS as tagsString, IS_CUSTOM as isCustom, USER_ID as userId, ",
        "CREATE_TIME as createTime ",
        "FROM food ",
        "WHERE 1=1 ",
        "<if test='type != null'>AND TYPE = #{type}</if> ",
        "<if test='keyword != null'>AND NAME LIKE CONCAT('%', #{keyword}, '%')</if> ",
        "<if test='userId != null'>AND (IS_CUSTOM = 0 OR USER_ID = #{userId})</if> ",
        "ORDER BY IS_CUSTOM ASC, CREATE_TIME DESC",
        "</script>"
    })
    List<Dish> selectDishes(@Param("type") String type, 
                           @Param("keyword") String keyword, 
                           @Param("userId") Long userId);
    
    /**
     * 根据ID查询菜品
     */
    @Select("SELECT ID as id, NAME as name, TYPE as type, CALORIE as calories, " +
            "PROTEIN as protein, METERIAL as material, STEP as steps, " +
            "TAGS as tagsString, IS_CUSTOM as isCustom, USER_ID as userId, " +
            "CREATE_TIME as createTime " +
            "FROM food WHERE ID = #{id}")
    Dish selectById(@Param("id") Long id);
    
    /**
     * 插入自定义菜品
     */
    @Insert("INSERT INTO food (NAME, TYPE, CALORIE, PROTEIN, METERIAL, STEP, TAGS, IS_CUSTOM, USER_ID, CREATE_TIME) " +
            "VALUES (#{name}, #{type}, #{calories}, #{protein}, #{material}, #{steps}, #{tagsString}, #{isCustom}, #{userId}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Dish dish);
    
    /**
     * 搜索菜品
     */
    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, CALORIE as calories, ",
        "PROTEIN as protein, METERIAL as material, STEP as steps, ",
        "TAGS as tagsString, IS_CUSTOM as isCustom, USER_ID as userId, ",
        "CREATE_TIME as createTime ",
        "FROM food ",
        "WHERE NAME LIKE CONCAT('%', #{keyword}, '%') ",
        "<if test='type != null'>AND TYPE = #{type}</if> ",
        "ORDER BY IS_CUSTOM ASC, CREATE_TIME DESC",
        "</script>"
    })
    List<Dish> searchDishes(@Param("keyword") String keyword, 
                           @Param("type") String type);
    
    /**
     * 根据IDs批量查询
     */
    @Select({
        "<script>",
        "SELECT ID as id, NAME as name, TYPE as type, CALORIE as calories, ",
        "PROTEIN as protein, METERIAL as material, STEP as steps, ",
        "TAGS as tagsString, IS_CUSTOM as isCustom, USER_ID as userId, ",
        "CREATE_TIME as createTime ",
        "FROM food WHERE ID IN ",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>",
        "#{id}",
        "</foreach>",
        "</script>"
    })
    List<Dish> selectByIds(@Param("ids") List<Long> ids);
}

