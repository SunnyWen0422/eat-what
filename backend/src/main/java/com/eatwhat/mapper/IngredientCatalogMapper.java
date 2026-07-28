package com.eatwhat.mapper;

import com.eatwhat.entity.IngredientCatalog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface IngredientCatalogMapper {
    @Select("SELECT id, canonical_name AS canonicalName, aliases, unit_family AS unitFamily, default_unit AS defaultUnit, metadata_version AS metadataVersion FROM ingredient_catalog ORDER BY id")
    List<IngredientCatalog> findAll();
}
