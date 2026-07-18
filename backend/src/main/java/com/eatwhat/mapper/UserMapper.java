package com.eatwhat.mapper;

import com.eatwhat.entity.User;
import org.apache.ibatis.annotations.*;
import java.util.List;

/**
 * 用户数据访问层
 */
@Mapper
public interface UserMapper {
    
    @Select("SELECT id, open_id as openId, session_key as sessionKey, union_id as unionId, " +
            "nickname, avatar, phone, register_time as registerTime, last_login_time as lastLoginTime, status " +
            "FROM users WHERE open_id = #{openId}")
    User selectByOpenId(@Param("openId") String openId);
    
    @Select("SELECT id, open_id as openId, session_key as sessionKey, union_id as unionId, " +
            "nickname, avatar, phone, register_time as registerTime, last_login_time as lastLoginTime, status " +
            "FROM users WHERE id = #{id}")
    User selectById(@Param("id") Long id);

    @Select("SELECT id, open_id as openId, session_key as sessionKey, union_id as unionId, " +
            "nickname, avatar, phone, register_time as registerTime, last_login_time as lastLoginTime, status " +
            "FROM users ORDER BY id DESC LIMIT 200")
    List<User> selectAll();
    
    @Insert("INSERT INTO users (open_id, session_key, union_id, nickname, avatar, phone, register_time, status) " +
            "VALUES (#{openId}, #{sessionKey}, #{unionId}, #{nickname}, #{avatar}, #{phone}, NOW(), #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);
    
    @Update("UPDATE users SET nickname = #{nickname}, avatar = #{avatar} WHERE id = #{id}")
    int update(User user);
    
    @Update("UPDATE users SET session_key = #{sessionKey}, last_login_time = NOW() WHERE open_id = #{openId}")
    int updateSessionKey(@Param("openId") String openId, @Param("sessionKey") String sessionKey);
    
    @Update("UPDATE users SET last_login_time = NOW() WHERE id = #{id}")
    int updateLastLoginTime(@Param("id") Long id);
    
    @Update("UPDATE users SET nickname = #{nickname}, avatar = #{avatar}, union_id = #{unionId} WHERE id = #{id}")
    int updateUserInfo(User user);
}

