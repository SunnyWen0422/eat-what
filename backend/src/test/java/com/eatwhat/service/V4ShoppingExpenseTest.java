package com.eatwhat.service;
import com.eatwhat.dto.*;import com.eatwhat.entity.*;import com.eatwhat.mapper.*;import com.eatwhat.util.ShoppingIngredientKey;
import com.fasterxml.jackson.databind.ObjectMapper;import org.junit.jupiter.api.Test;import java.util.*;
import static org.mockito.Mockito.*;import static org.junit.jupiter.api.Assertions.*;
class V4ShoppingExpenseTest {
 @Test void zeroSpendIsSeparateAndStaleOrForeignIngredientCannotBeWritten() {
  ShoppingMutationMapper logs=mock(ShoppingMutationMapper.class);ShoppingListMapper lists=mock(ShoppingListMapper.class);ShoppingExpenseMapper expenses=mock(ShoppingExpenseMapper.class);ShoppingItemMapper items=mock(ShoppingItemMapper.class);ShoppingListService read=mock(ShoppingListService.class);
  ShoppingList list=new ShoppingList();list.setId(5L);list.setVersion(2L);when(logs.lockUser(1L)).thenReturn(1L);when(logs.request(anyLong(),anyString())).thenReturn(null);when(lists.findByUserIdForUpdate(1L)).thenReturn(list);
  ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();item.setSourceDishId(1L);item.setCanonicalName("番茄");item.setDisplayName("番茄");ShoppingDishDTO group=new ShoppingDishDTO();group.setItems(Arrays.asList(item));ShoppingListResponse response=new ShoppingListResponse();response.setListId(5L);response.setDishes(Arrays.asList(group));when(read.getList(1L,"all")).thenReturn(response);when(expenses.find(5L)).thenReturn(Collections.emptyList());
  ShoppingMutationService service=new ShoppingMutationService(logs,lists,mock(ShoppingDishMapper.class),items,read,new ObjectMapper());service.setExpenses(expenses);
  ShoppingExpenseRequest request=new ShoppingExpenseRequest();request.setRequestId("expense-1");request.setExpectedListVersion(2L);request.setIngredientKey(ShoppingIngredientKey.of(item));request.setAmount("0.00");request.setChannel("超市");service.expense(1L,request);
  org.mockito.ArgumentCaptor<ShoppingExpense> capture=org.mockito.ArgumentCaptor.forClass(ShoppingExpense.class);verify(expenses).save(eq(5L),capture.capture());assertEquals("0.00",capture.getValue().getAmount().toPlainString());verifyNoInteractions(items);
  request.setRequestId("expense-2");request.setIngredientKey("foreign");assertThrows(IllegalArgumentException.class,()->service.expense(1L,request));request.setExpectedListVersion(1L);assertThrows(ShoppingListService.VersionConflictException.class,()->service.expense(1L,request));
 }
}
