package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ShoppingListReliabilityTest {
    @Test void firstPurchaseReadsAnExplicitZeroVersion() {
        ShoppingListService service = new ShoppingListService(mock(ShoppingListMapper.class),
            mock(ShoppingDishMapper.class), mock(ShoppingItemMapper.class),
            mock(ShoppingRequestLogMapper.class), mock(ShoppingListMergeService.class),
            mock(ShoppingPreviewService.class), new ObjectMapper());
        ShoppingListResponse empty = service.getList(3L, "all");
        assertEquals(Long.valueOf(0), empty.getVersion());
        assertTrue(empty.getDishes().isEmpty());
    }
    @Test void repeatPreviewStoresRawLinesAndRemovesOmittedUnprotectedLine() {
        ShoppingListMapper lists=mock(ShoppingListMapper.class);ShoppingDishMapper groups=mock(ShoppingDishMapper.class);
        ShoppingItemMapper items=mock(ShoppingItemMapper.class);ShoppingPreviewService previews=mock(ShoppingPreviewService.class);
        ShoppingListMergeService merge=mock(ShoppingListMergeService.class);
        ShoppingList list=new ShoppingList();list.setId(1L);list.setVersion(2L);
        when(lists.findByUserIdForUpdate(3L)).thenReturn(list);
        ShoppingDish group=new ShoppingDish();group.setId(7L);group.setShoppingListId(1L);group.setDishId(9L);
        when(groups.findBySelectionKey(1L,"meal-one")).thenReturn(group);
        ShoppingPreviewItemDTO line=new ShoppingPreviewItemDTO();line.setSourceDishId(9L);line.setSourceLineNo(1);line.setCanonicalName("盐");line.setQuantityText("1克");
        ShoppingDishDTO previewGroup=new ShoppingDishDTO();previewGroup.setItems(java.util.Collections.singletonList(line));
        ShoppingPreviewResponse preview=new ShoppingPreviewResponse();preview.setDishes(java.util.Collections.singletonList(previewGroup));
        when(previews.createPreview(eq(3L),any())).thenReturn(preview);
        ShoppingItem old=new ShoppingItem();old.setId(8L);old.setShoppingDishId(7L);old.setSourceLineNo(0);old.setChecked(false);old.setUserOverride(false);
        when(items.findByListId(1L,"all")).thenReturn(java.util.Collections.singletonList(old));
        ShoppingDishRequest selected=new ShoppingDishRequest();selected.setSelectionKey("meal-one");selected.setItems(java.util.Collections.singletonList(line));
        ShoppingBatchAddRequest request=new ShoppingBatchAddRequest();request.setRequestId("purchase-one");request.setExpectedListVersion(2L);request.setDishes(java.util.Collections.singletonList(selected));
        ShoppingListService service=new ShoppingListService(lists,groups,items,mock(ShoppingRequestLogMapper.class),merge,previews,new ObjectMapper());
        service.batchAdd(3L,request);
        verify(items).delete(8L,1L);
        org.mockito.ArgumentCaptor<ShoppingItem> capture=org.mockito.ArgumentCaptor.forClass(ShoppingItem.class);verify(items).insert(capture.capture());
        assertEquals(1,capture.getValue().getSourceLineNo());verify(merge,never()).mergeWithinDish(anyLong(),anyList());
        old.setChecked(true);request.setRequestId("purchase-two");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.batchAdd(3L,request));
    }
    @Test void checkOnlyDoesNotOverrideQuantityOrUncheckedState() {
        ShoppingListMapper lists = mock(ShoppingListMapper.class);
        ShoppingItemMapper items = mock(ShoppingItemMapper.class);
        ShoppingList list = new ShoppingList(); list.setId(1L); list.setVersion(2L);
        ShoppingItem item = new ShoppingItem(); item.setId(5L); item.setUserOverride(false); item.setChecked(false);
        when(lists.findByUserIdForUpdate(3L)).thenReturn(list);
        when(items.findById(5L,1L)).thenReturn(item);
        ShoppingListService service = new ShoppingListService(lists,mock(ShoppingDishMapper.class),items,
            mock(ShoppingRequestLogMapper.class),mock(ShoppingListMergeService.class),mock(ShoppingPreviewService.class),new ObjectMapper());
        ShoppingItemPatchRequest patch = new ShoppingItemPatchRequest(); patch.setExpectedListVersion(2L); patch.setChecked(true);
        service.patchItem(3L,5L,patch);
        assertTrue(item.getChecked()); assertFalse(item.getUserOverride());
    }
    @Test void brokenReplayNeverRepeatsACommittedWrite() {
        ShoppingRequestLogMapper logs = mock(ShoppingRequestLogMapper.class);
        ShoppingRequestLog log = new ShoppingRequestLog(); log.setResponseJson("invalid-json");
        when(logs.findSuccess(3L,"same-request")).thenReturn(log);
        ShoppingListService service = new ShoppingListService(mock(ShoppingListMapper.class),mock(ShoppingDishMapper.class),
            mock(ShoppingItemMapper.class),logs,mock(ShoppingListMergeService.class),mock(ShoppingPreviewService.class),new ObjectMapper());
        ShoppingClearRequest request = new ShoppingClearRequest(); request.setRequestId("same-request"); request.setScope("all"); request.setExpectedListVersion(2L);
        try { log.setRequestHash(com.eatwhat.util.WorkflowRequestHash.sha256("ShoppingClearRequest|"+new ObjectMapper().writeValueAsString(request))); }
        catch(Exception error) { throw new AssertionError(error); }
        assertThrows(IllegalStateException.class,()->service.clear(3L,request));
        verify(logs,never()).insertSuccess(anyLong(),anyString(),anyString());
    }
}
