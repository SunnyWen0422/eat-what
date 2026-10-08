package com.eatwhat.mapper;

import org.apache.ibatis.annotations.*;
import java.util.Map;

@Mapper
public interface ControlledToolTaskMapper {
    String COLUMNS="request_hash AS requestHash,CAST(state_json AS CHAR) AS stateJson";
    @Select("SELECT "+COLUMNS+" FROM controlled_tool_task WHERE user_id=#{user} AND id=#{id}")
    Map<String,Object> find(@Param("user") Long user,@Param("id") String id);
    @Select("SELECT "+COLUMNS+" FROM controlled_tool_task WHERE user_id=#{user} AND request_id=#{requestId}")
    Map<String,Object> byRequest(@Param("user") Long user,@Param("requestId") String requestId);
    @Insert("INSERT INTO controlled_tool_task(id,user_id,request_id,request_hash,state_json) VALUES(#{id},#{user},#{requestId},#{hash},#{state})")
    int insert(@Param("id") String id,@Param("user") Long user,@Param("requestId") String requestId,@Param("hash") String hash,@Param("state") String state);
    @Update("UPDATE controlled_tool_task SET state_json=#{state},updated_at=NOW() WHERE user_id=#{user} AND id=#{id}")
    int save(@Param("user") Long user,@Param("id") String id,@Param("state") String state);
}
