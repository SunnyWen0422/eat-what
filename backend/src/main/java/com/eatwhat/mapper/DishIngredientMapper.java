package com.eatwhat.mapper;

import com.eatwhat.entity.DishIngredient;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface DishIngredientMapper {
    @Select("SELECT id, dish_id AS dishId, sequence_no AS sequenceNo, source_text AS sourceText, canonical_name AS canonicalName, quantity_kind AS quantityKind, quantity_value AS quantityValue, quantity_min AS quantityMin, quantity_max AS quantityMax, unit_code AS unitCode, unit_family AS unitFamily, category, preparation, base_people AS basePeople, source_allowance_percent AS sourceAllowancePercent, parse_status AS parseStatus, parse_message AS parseMessage, source_hash AS sourceHash, metadata_version AS metadataVersion FROM dish_ingredient WHERE dish_id = #{dishId} ORDER BY sequence_no")
    List<DishIngredient> findByDishId(@Param("dishId") Long dishId);

    @Insert("INSERT INTO dish_ingredient (dish_id, sequence_no, source_text, canonical_name, quantity_kind, quantity_value, quantity_min, quantity_max, unit_code, unit_family, category, preparation, base_people, source_allowance_percent, parse_status, parse_message, source_hash, metadata_version) VALUES (#{dishId}, #{sequenceNo}, #{sourceText}, #{canonicalName}, #{quantityKind}, #{quantityValue}, #{quantityMin}, #{quantityMax}, #{unitCode}, #{unitFamily}, #{category}, #{preparation}, #{basePeople}, #{sourceAllowancePercent}, #{parseStatus}, #{parseMessage}, #{sourceHash}, #{metadataVersion})")
    int insert(DishIngredient ingredient);

    @Delete("DELETE FROM dish_ingredient WHERE dish_id = #{dishId}")
    int deleteByDishId(@Param("dishId") Long dishId);
}
