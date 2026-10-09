package com.eatwhat.mapper;

import com.eatwhat.entity.Dish;
import org.apache.ibatis.annotations.*;
import java.util.List;

/** Dedicated read-only queries; no legacy ownership OR or publication NULL defaults. */
@Mapper
public interface PublicCatalogMapper {
    String COLUMNS = "ID AS id, NAME AS name, TYPE AS type, CL AS cl, FL AS fl, STEP AS step, " +
        "INGREDIENTS_AMOUNTS AS ingredientsAmounts, STEPS AS steps, STEP_IMAGES AS stepImages, TIPS AS tips, " +
        "TAGS AS tags, CUISINE_CODE AS cuisineCode, TAG_CODES AS tagCodes, COOK_MINUTES AS cookMinutes, " +
        "METADATA_VERSION AS metadataVersion, IMAGE AS image, DIFFICULTY AS difficulty, COOK_TIME AS cookTime, " +
        "METHODS AS methods, KCAL AS kcal, user_id AS userId, is_custom AS isCustom, is_published AS isPublished";
    String RELEASE = " user_id IS NULL AND is_custom = 0 AND is_published = 1 AND " +
        "<choose><when test='ids != null and ids.size() > 0'>ID IN " +
        "<foreach item='releaseId' collection='ids' open='(' separator=',' close=')'>#{releaseId}</foreach>" +
        "</when><otherwise>1 = 0</otherwise></choose> ";
    String TYPE = "<if test='type != null'> AND TYPE = #{type}</if> ";

    @Select({"<script>SELECT " + COLUMNS + " FROM food WHERE " + RELEASE + TYPE + " ORDER BY ID LIMIT #{limit} OFFSET #{offset}</script>"})
    List<Dish> list(@Param("ids") List<Long> ids, @Param("type") String type, @Param("limit") int limit, @Param("offset") int offset);

    @Select({"<script>SELECT COUNT(*) FROM food WHERE " + RELEASE + TYPE + "</script>"})
    long count(@Param("ids") List<Long> ids, @Param("type") String type);

    @Select({"<script>SELECT " + COLUMNS + " FROM food WHERE " + RELEASE + " AND ID = #{id}</script>"})
    Dish detail(@Param("ids") List<Long> ids, @Param("id") long id);
}
