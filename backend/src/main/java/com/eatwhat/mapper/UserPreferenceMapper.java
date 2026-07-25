package com.eatwhat.mapper;

import com.eatwhat.entity.UserPreference;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserPreferenceMapper {
    @Select("SELECT USER_ID as userId, CAST(PREFERRED_CUISINES AS CHAR) as preferredCuisinesJson, " +
            "CAST(PREFERRED_TAGS AS CHAR) as preferredTagsJson, CAST(EXCLUDED_TAGS AS CHAR) as excludedTagsJson, " +
            "CAST(EXCLUDED_INGREDIENTS AS CHAR) as excludedIngredientsJson, AVOID_RECENT_DAYS as avoidRecentDays, " +
            "MAX_COOK_MINUTES as maxCookMinutes, VERSION as version, UPDATED_AT as updatedAt " +
            "FROM user_preference WHERE USER_ID = #{userId}")
    UserPreference selectByUserId(@Param("userId") Long userId);

    @Insert("INSERT INTO user_preference (USER_ID, PREFERRED_CUISINES, PREFERRED_TAGS, EXCLUDED_TAGS, " +
            "EXCLUDED_INGREDIENTS, AVOID_RECENT_DAYS, MAX_COOK_MINUTES, VERSION) VALUES " +
            "(#{userId}, #{preferredCuisinesJson}, #{preferredTagsJson}, #{excludedTagsJson}, " +
            "#{excludedIngredientsJson}, #{avoidRecentDays}, #{maxCookMinutes}, #{version}) " +
            "ON DUPLICATE KEY UPDATE PREFERRED_CUISINES=VALUES(PREFERRED_CUISINES), " +
            "PREFERRED_TAGS=VALUES(PREFERRED_TAGS), EXCLUDED_TAGS=VALUES(EXCLUDED_TAGS), " +
            "EXCLUDED_INGREDIENTS=VALUES(EXCLUDED_INGREDIENTS), AVOID_RECENT_DAYS=VALUES(AVOID_RECENT_DAYS), " +
            "MAX_COOK_MINUTES=VALUES(MAX_COOK_MINUTES), VERSION=VALUES(VERSION), UPDATED_AT=NOW()")
    int upsert(UserPreference preference);
}
