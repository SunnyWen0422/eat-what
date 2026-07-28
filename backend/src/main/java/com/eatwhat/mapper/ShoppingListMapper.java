package com.eatwhat.mapper;

import com.eatwhat.entity.ShoppingList;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ShoppingListMapper {
    @Select("SELECT id, user_id AS userId, version, metadata_version AS metadataVersion, created_at AS createdAt, updated_at AS updatedAt FROM shopping_list WHERE user_id = #{userId}")
    ShoppingList findByUserId(@Param("userId") Long userId);

    @Select("SELECT id, user_id AS userId, version, metadata_version AS metadataVersion, created_at AS createdAt, updated_at AS updatedAt FROM shopping_list WHERE user_id = #{userId} FOR UPDATE")
    ShoppingList findByUserIdForUpdate(@Param("userId") Long userId);

    @Insert("INSERT INTO shopping_list (user_id, version, metadata_version) VALUES (#{userId}, 0, 1)")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ShoppingList list);

    @Update("UPDATE shopping_list SET version = #{version}, metadata_version = #{metadataVersion} WHERE id = #{id} AND user_id = #{userId}")
    int updateVersion(@Param("id") Long id, @Param("userId") Long userId, @Param("version") Long version, @Param("metadataVersion") Integer metadataVersion);
}
