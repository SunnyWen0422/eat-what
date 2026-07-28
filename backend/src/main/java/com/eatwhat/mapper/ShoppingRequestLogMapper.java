package com.eatwhat.mapper;

import com.eatwhat.entity.ShoppingRequestLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ShoppingRequestLogMapper {
    @Select("SELECT id, user_id AS userId, request_id AS requestId, response_json AS responseJson, status, created_at AS createdAt FROM shopping_request_log WHERE user_id = #{userId} AND request_id = #{requestId} AND status = 'SUCCESS'")
    ShoppingRequestLog findSuccess(@Param("userId") Long userId, @Param("requestId") String requestId);

    @Insert("INSERT INTO shopping_request_log (user_id, request_id, response_json, status) VALUES (#{userId}, #{requestId}, #{responseJson}, 'SUCCESS')")
    int insertSuccess(@Param("userId") Long userId, @Param("requestId") String requestId, @Param("responseJson") String responseJson);
}
