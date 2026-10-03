package com.eatwhat.mapper;
import org.apache.ibatis.annotations.*;
import java.util.Map;
@Mapper
public interface ShoppingMutationMapper {
    @Select("SELECT id FROM users WHERE id=#{userId} FOR UPDATE")
    Long lockUser(@Param("userId") Long userId);
    @Select("SELECT request_hash AS requestHash,response_json AS responseJson FROM shopping_mutation_log WHERE user_id=#{userId} AND request_id=#{requestId}")
    Map<String,Object> request(@Param("userId") Long userId,@Param("requestId") String requestId);
    @Insert("INSERT INTO shopping_mutation_log(user_id,request_id,request_hash,response_json) VALUES(#{userId},#{requestId},#{hash},#{response})")
    int log(@Param("userId") Long userId,@Param("requestId") String requestId,@Param("hash") String hash,@Param("response") String response);
}
