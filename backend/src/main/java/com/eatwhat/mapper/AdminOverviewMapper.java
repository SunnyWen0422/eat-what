package com.eatwhat.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.Map;

@Mapper
public interface AdminOverviewMapper {
    @Select("SELECT " +
            "(SELECT COUNT(*) FROM users) AS totalUsers, " +
            "(SELECT COUNT(*) FROM users WHERE status = 1) AS activeUsers, " +
            "(SELECT COUNT(*) FROM users WHERE status = 0) AS disabledUsers, " +
            "(SELECT COUNT(*) FROM food WHERE user_id IS NULL) AS systemDishes, " +
            "(SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL AND is_custom = 1) AS customDishes, " +
            "(SELECT COUNT(*) FROM users WHERE register_time >= CURDATE()) AS todayNewUsers, " +
            "(SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL AND is_custom = 1 AND create_time >= CURDATE()) AS todayNewDishes")
    Map<String, Object> selectOverview();
}
