package com.eatwhat.mapper;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.*;
@Mapper
public interface DishQualityMapper {
    @Data class Row { private Long dishId; private String profileJson; }
    @Select({"<script>","SELECT dish_id AS dishId, profile_json AS profileJson FROM dish_quality_profile WHERE dish_id IN",
        "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach>","</script>"})
    List<Row> find(@Param("ids") List<Long> ids);
}
