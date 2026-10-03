package com.eatwhat.mapper;

import com.eatwhat.entity.ShoppingDish;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ShoppingDishMapper {
    @Select("SELECT id, shopping_list_id AS shoppingListId, selection_key AS selectionKey, dish_id AS dishId, dish_name AS dishName, target_people AS targetPeople, DATE_FORMAT(source_date,'%Y-%m-%d') AS sourceDate, source_meal_type AS sourceMealType, created_at AS createdAt, updated_at AS updatedAt FROM shopping_dish WHERE shopping_list_id = #{listId} ORDER BY id")
    List<ShoppingDish> findByListId(@Param("listId") Long listId);

    @Select("SELECT id, shopping_list_id AS shoppingListId, selection_key AS selectionKey, dish_id AS dishId, dish_name AS dishName, target_people AS targetPeople, DATE_FORMAT(source_date,'%Y-%m-%d') AS sourceDate, source_meal_type AS sourceMealType, created_at AS createdAt, updated_at AS updatedAt FROM shopping_dish WHERE id = #{id} AND shopping_list_id = #{listId}")
    ShoppingDish findById(@Param("id") Long id, @Param("listId") Long listId);

    @Select("SELECT id, shopping_list_id AS shoppingListId, selection_key AS selectionKey, dish_id AS dishId, dish_name AS dishName, target_people AS targetPeople, DATE_FORMAT(source_date,'%Y-%m-%d') AS sourceDate, source_meal_type AS sourceMealType, created_at AS createdAt, updated_at AS updatedAt FROM shopping_dish WHERE shopping_list_id = #{listId} AND selection_key = #{selectionKey}")
    ShoppingDish findBySelectionKey(@Param("listId") Long listId, @Param("selectionKey") String selectionKey);

    @Insert("INSERT INTO shopping_dish (shopping_list_id, selection_key, dish_id, dish_name, target_people, source_date, source_meal_type) VALUES (#{shoppingListId}, #{selectionKey}, #{dishId}, #{dishName}, #{targetPeople}, #{sourceDate}, #{sourceMealType})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ShoppingDish dish);
    @Update("UPDATE shopping_dish SET source_date=#{sourceDate},source_meal_type=#{sourceMealType},target_people=#{targetPeople} WHERE id=#{id} AND shopping_list_id=#{shoppingListId}")
    int updateSource(ShoppingDish dish);
    @Delete("DELETE FROM shopping_dish WHERE shopping_list_id=#{listId} AND NOT EXISTS (SELECT 1 FROM shopping_item i WHERE i.shopping_dish_id=shopping_dish.id)")
    int removeEmpty(@Param("listId") Long listId);
}
