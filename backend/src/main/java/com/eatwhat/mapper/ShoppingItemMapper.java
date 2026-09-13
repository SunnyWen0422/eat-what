package com.eatwhat.mapper;

import com.eatwhat.entity.ShoppingItem;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ShoppingItemMapper {
    @Select("SELECT i.id, i.shopping_dish_id AS shoppingDishId, i.source_line_no AS sourceLineNo, i.canonical_name AS canonicalName, i.display_name AS displayName, i.normalized_variant AS normalizedVariant, i.quantity_value AS quantityValue, i.quantity_min AS quantityMin, i.quantity_max AS quantityMax, i.quantity_text AS quantityText, i.unit_code AS unitCode, i.unit_family AS unitFamily, i.category, i.source_quantity_text AS sourceQuantityText, i.parse_status AS parseStatus, i.calculation_status AS calculationStatus, i.checked, i.user_override AS userOverride, i.created_at AS createdAt, i.updated_at AS updatedAt FROM shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id WHERE d.shopping_list_id = #{listId} AND (#{status} = 'all' OR (#{status} = 'pending' AND i.checked = 0) OR (#{status} = 'checked' AND i.checked = 1)) ORDER BY d.id, i.source_line_no, i.id")
    List<ShoppingItem> findByListId(@Param("listId") Long listId, @Param("status") String status);

    @Select("SELECT i.id, i.shopping_dish_id AS shoppingDishId, i.source_line_no AS sourceLineNo, i.canonical_name AS canonicalName, i.display_name AS displayName, i.normalized_variant AS normalizedVariant, i.quantity_value AS quantityValue, i.quantity_min AS quantityMin, i.quantity_max AS quantityMax, i.quantity_text AS quantityText, i.unit_code AS unitCode, i.unit_family AS unitFamily, i.category, i.source_quantity_text AS sourceQuantityText, i.parse_status AS parseStatus, i.calculation_status AS calculationStatus, i.checked, i.user_override AS userOverride, i.created_at AS createdAt, i.updated_at AS updatedAt FROM shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id WHERE i.id = #{id} AND d.shopping_list_id = #{listId}")
    ShoppingItem findById(@Param("id") Long id, @Param("listId") Long listId);

    @Select("SELECT i.id, i.shopping_dish_id AS shoppingDishId, i.source_line_no AS sourceLineNo, i.canonical_name AS canonicalName, i.display_name AS displayName, i.normalized_variant AS normalizedVariant, i.quantity_value AS quantityValue, i.quantity_min AS quantityMin, i.quantity_max AS quantityMax, i.quantity_text AS quantityText, i.unit_code AS unitCode, i.unit_family AS unitFamily, i.category, i.source_quantity_text AS sourceQuantityText, i.parse_status AS parseStatus, i.calculation_status AS calculationStatus, i.checked, i.user_override AS userOverride, i.created_at AS createdAt, i.updated_at AS updatedAt FROM shopping_item i WHERE i.shopping_dish_id = #{shoppingDishId} AND i.source_line_no = #{sourceLineNo}")
    ShoppingItem findBySource(@Param("shoppingDishId") Long shoppingDishId, @Param("sourceLineNo") Integer sourceLineNo);

    @Insert("INSERT INTO shopping_item (shopping_dish_id, source_line_no, canonical_name, display_name, normalized_variant, quantity_value, quantity_min, quantity_max, quantity_text, unit_code, unit_family, category, source_quantity_text, parse_status, calculation_status, checked, user_override) VALUES (#{shoppingDishId}, #{sourceLineNo}, #{canonicalName}, #{displayName}, #{normalizedVariant}, #{quantityValue}, #{quantityMin}, #{quantityMax}, #{quantityText}, #{unitCode}, #{unitFamily}, #{category}, #{sourceQuantityText}, #{parseStatus}, #{calculationStatus}, #{checked}, #{userOverride})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ShoppingItem item);

    @Update("UPDATE shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id SET i.display_name = #{item.displayName}, i.quantity_value = #{item.quantityValue}, i.quantity_text = #{item.quantityText}, i.unit_code = #{item.unitCode}, i.checked = COALESCE(#{item.checked}, i.checked), i.user_override = COALESCE(#{item.userOverride}, i.user_override) WHERE i.id = #{item.id} AND d.shopping_list_id = #{listId}")
    int update(@Param("item") ShoppingItem item, @Param("listId") Long listId);

    @Delete("DELETE i FROM shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id WHERE i.id = #{id} AND d.shopping_list_id = #{listId}")
    int delete(@Param("id") Long id, @Param("listId") Long listId);

    @Delete("DELETE i FROM shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id WHERE d.shopping_list_id = #{listId} AND i.checked = 1")
    int deleteChecked(@Param("listId") Long listId);

    @Delete("DELETE i FROM shopping_item i JOIN shopping_dish d ON d.id = i.shopping_dish_id WHERE d.shopping_list_id = #{listId}")
    int deleteAll(@Param("listId") Long listId);
}
