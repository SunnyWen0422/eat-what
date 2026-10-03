package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ShoppingMutationServiceTest {
    @Test void manualItemHasPersistentSourceAndKeepsNote() {
        ShoppingListMapper lists=mock(ShoppingListMapper.class);ShoppingDishMapper groups=mock(ShoppingDishMapper.class);ShoppingItemMapper items=mock(ShoppingItemMapper.class);ShoppingMutationMapper logs=mock(ShoppingMutationMapper.class);ShoppingListService listService=mock(ShoppingListService.class);
        when(logs.lockUser(1L)).thenReturn(1L);when(logs.request(anyLong(),anyString())).thenReturn(null);ShoppingList list=new ShoppingList();list.setId(5L);list.setVersion(0L);list.setMetadataVersion(1);when(lists.findByUserIdForUpdate(1L)).thenReturn(list);
        when(groups.insert(any())).thenAnswer(i->{((ShoppingDish)i.getArgument(0)).setId(7L);return 1;});
        when(listService.getList(1L,"all")).thenReturn(new ShoppingListResponse());
        ShoppingMutationService service=new ShoppingMutationService(logs,lists,groups,items,listService,new ObjectMapper());
        ShoppingManualRequest request=new ShoppingManualRequest();request.setRequestId("manual-1");request.setExpectedListVersion(0L);request.setName("鸡蛋");request.setQuantityText("6个");request.setNote("买小包装");
        service.manual(1L,request);
        org.mockito.ArgumentCaptor<ShoppingItem> capture=org.mockito.ArgumentCaptor.forClass(ShoppingItem.class);verify(items).insert(capture.capture());
        assertNotNull(capture.getValue().getCanonicalName());assertTrue(capture.getValue().getCanonicalName().length()<=120);assertEquals("鸡蛋",capture.getValue().getDisplayName());assertEquals("6个",capture.getValue().getQuantityText());assertEquals("买小包装",capture.getValue().getSourceQuantityText());assertEquals(7L,capture.getValue().getShoppingDishId());
    }
    @Test void rejectsForeignItemBeforeChangingAnyCheckedState() {
        ShoppingListMapper lists=mock(ShoppingListMapper.class);ShoppingItemMapper items=mock(ShoppingItemMapper.class);ShoppingMutationMapper logs=mock(ShoppingMutationMapper.class);
        when(logs.lockUser(1L)).thenReturn(1L);when(logs.request(anyLong(),anyString())).thenReturn(null);ShoppingList list=new ShoppingList();list.setId(5L);list.setVersion(0L);when(lists.findByUserIdForUpdate(1L)).thenReturn(list);
        ShoppingItem own=new ShoppingItem();own.setId(1L);when(items.findById(1L,5L)).thenReturn(own);
        ShoppingMutationService service=new ShoppingMutationService(logs,lists,mock(ShoppingDishMapper.class),items,mock(ShoppingListService.class),new ObjectMapper());
        ShoppingCheckRequest request=new ShoppingCheckRequest();request.setRequestId("check-1");request.setExpectedListVersion(0L);request.setItemIds(Arrays.asList(1L,99L));request.setChecked(true);
        assertThrows(IllegalArgumentException.class,()->service.check(1L,request));assertNull(own.getChecked());
    }
}
