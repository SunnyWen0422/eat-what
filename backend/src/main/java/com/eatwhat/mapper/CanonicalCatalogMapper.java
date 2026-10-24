package com.eatwhat.mapper;
import org.apache.ibatis.annotations.*;
import java.util.*;
@Mapper
public interface CanonicalCatalogMapper {
 @Select("<script>SELECT document FROM catalog_ingredient WHERE id IN <foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach></script>")
 List<String> ingredients(@Param("ids") Collection<String> ids);
 @Select("SELECT document FROM catalog_ingredient WHERE #{keyword}='' OR JSON_UNQUOTE(JSON_EXTRACT(document,'$.name')) LIKE CONCAT('%',#{keyword},'%') OR JSON_EXTRACT(document,'$.aliases') LIKE CONCAT('%',#{keyword},'%') ORDER BY id LIMIT 100")
 List<String> searchIngredients(@Param("keyword") String keyword);
 @Select("SELECT document FROM catalog_metadata WHERE id=1") String metadata();
}
