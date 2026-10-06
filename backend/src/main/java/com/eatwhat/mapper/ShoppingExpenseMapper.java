package com.eatwhat.mapper;
import com.eatwhat.dto.ShoppingExpense;
import org.apache.ibatis.annotations.*;
import java.util.List;
@Mapper
public interface ShoppingExpenseMapper {
    @Select("SELECT ingredient_key AS ingredientKey, amount, channel FROM shopping_expense WHERE list_id=#{listId}")
    List<ShoppingExpense> find(@Param("listId") Long listId);
    @Insert("INSERT INTO shopping_expense(list_id,ingredient_key,amount,channel) VALUES(#{listId},#{e.ingredientKey},#{e.amount},#{e.channel}) ON DUPLICATE KEY UPDATE amount=VALUES(amount),channel=VALUES(channel)")
    int save(@Param("listId") Long listId, @Param("e") ShoppingExpense expense);
    @Delete("DELETE FROM shopping_expense WHERE list_id=#{listId} AND ingredient_key=#{key}")
    int delete(@Param("listId") Long listId,@Param("key") String key);
}
