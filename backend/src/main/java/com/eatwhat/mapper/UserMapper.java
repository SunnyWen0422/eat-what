package com.eatwhat.mapper;

import com.eatwhat.entity.User;
import org.apache.ibatis.annotations.*;

/**
 * 用户数据访问层
 */
@Mapper
public interface UserMapper {
    
    @Select("SELECT id, open_id as openId, nickname, avatar, register_time as registerTime " +
            "FROM users WHERE open_id = #{openId}")
    User selectByOpenId(@Param("openId") String openId);
    
    @Insert("INSERT INTO users (open_id, nickname, avatar, register_time) " +
            "VALUES (#{openId}, #{nickname}, #{avatar}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);
    
    @Update("UPDATE users SET nickname = #{nickname}, avatar = #{avatar} WHERE id = #{id}")
    int update(User user);
}

