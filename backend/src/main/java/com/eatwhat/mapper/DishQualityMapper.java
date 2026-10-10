package com.eatwhat.mapper;
import com.eatwhat.dto.CatalogQuality;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.*;
@Mapper
public interface DishQualityMapper {
    @Data class Row { private Long dishId; private String profileJson; }
    @Select({"<script>","SELECT dish_id AS dishId, profile_json AS profileJson FROM dish_quality_profile WHERE dish_id IN",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>","</script>"})
    List<Row> find(@Param("ids") List<Long> ids);
    @Insert("INSERT INTO dish_quality_profile(dish_id,dataset_version,source_hash,content_hash,review_status,profile_json) " +
        "VALUES(#{quality.dishId},#{quality.datasetVersion},#{quality.sourceHash},#{quality.contentHash},#{quality.reviewStatus},#{profileJson}) " +
        "ON DUPLICATE KEY UPDATE dataset_version=VALUES(dataset_version),source_hash=VALUES(source_hash),content_hash=VALUES(content_hash)," +
        "review_status=VALUES(review_status),profile_json=VALUES(profile_json),updated_at=CURRENT_TIMESTAMP")
    int save(@Param("quality") CatalogQuality quality,@Param("profileJson") String profileJson);
    @Insert("INSERT IGNORE INTO dish_quality_revision(id,dish_id,dataset_version,source_hash,profile_json) " +
        "VALUES(#{quality.contentHash},#{quality.dishId},#{quality.datasetVersion},#{quality.sourceHash},#{profileJson})")
    int saveRevision(@Param("quality") CatalogQuality quality,@Param("profileJson") String profileJson);
}
