package com.eatwhat.mapper;
import org.apache.ibatis.annotations.*;
@Mapper
public interface UserAvatarMapper {
    @Insert("INSERT INTO user_avatar (image_id,user_id,image_bytes) VALUES (#{imageId},#{userId},#{bytes})")
    int insert(@Param("imageId") String imageId,@Param("userId") Long userId,@Param("bytes") byte[] bytes);
    @Select("SELECT image_bytes AS imageBytes FROM user_avatar WHERE image_id=#{imageId}")
    com.eatwhat.entity.UserAvatar read(@Param("imageId") String imageId);
    @Delete("DELETE FROM user_avatar WHERE user_id=#{userId} AND image_id != #{imageId}")
    int removeOld(@Param("userId") Long userId,@Param("imageId") String imageId);
}
