package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ShoppingAddReceiptTest {
    static class Fixture {
        ObjectMapper json = new ObjectMapper();
        ShoppingListMapper lists = mock(ShoppingListMapper.class);
        ShoppingDishMapper groups = mock(ShoppingDishMapper.class);
        ShoppingItemMapper items = mock(ShoppingItemMapper.class);
        ShoppingRequestLogMapper logs = mock(ShoppingRequestLogMapper.class);
        ShoppingPreviewService previews = mock(ShoppingPreviewService.class);
        ShoppingListService service = new ShoppingListService(lists, groups, items, logs, mock(ShoppingListMergeService.class), previews, json);
        ShoppingBatchAddRequest request = new ShoppingBatchAddRequest();
        Map<String, ShoppingRequestLog> receipts = new HashMap<>();
        ShoppingList list = new ShoppingList();
        Fixture() throws Exception {
            list.setId(1L); list.setVersion(2L);
            when(lists.findByUserIdForUpdate(3L)).thenReturn(list); when(lists.findByUserId(3L)).thenReturn(list);
            when(lists.updateVersion(eq(1L),eq(3L),anyLong(),anyInt())).thenAnswer(i -> { list.setVersion(i.getArgument(2)); return 1; });
            ShoppingDish group = new ShoppingDish(); group.setId(7L); group.setDishId(9L); group.setShoppingListId(1L);
            when(groups.findBySelectionKey(1L,"meal-one")).thenReturn(group);
            when(groups.findByListId(1L)).thenReturn(Collections.singletonList(group));
            List<ShoppingPreviewItemDTO> lines = new ArrayList<>();
            for (int n=0;n<8;n++) { ShoppingPreviewItemDTO line=new ShoppingPreviewItemDTO();line.setSourceDishId(9L);line.setSourceLineNo(n);line.setDisplayName("盐");line.setQuantityText("少许"); lines.add(line); }
            ShoppingDishDTO dish = new ShoppingDishDTO(); dish.setItems(lines);
            ShoppingPreviewResponse preview = new ShoppingPreviewResponse(); preview.setDishes(Collections.singletonList(dish));
            when(previews.createPreview(eq(3L),any())).thenReturn(preview);
            for(int n=0;n<2;n++) { ShoppingItem existing=new ShoppingItem();existing.setId(20L+n);existing.setShoppingDishId(7L);existing.setSourceLineNo(n);existing.setChecked(true);existing.setUserOverride(n==1); when(items.findBySource(7L,n)).thenReturn(existing); }
            ShoppingDishRequest selected=new ShoppingDishRequest();selected.setSelectionKey("meal-one");selected.setItems(lines);
            request.setDishes(Collections.singletonList(selected));request.setRequestId("purchase-receipt");request.setExpectedListVersion(2L);
            when(logs.findSuccess(eq(3L),anyString())).thenAnswer(i -> receipts.get(i.getArgument(1)));
            when(logs.insertBoundSuccess(eq(3L),anyString(),anyString(),anyString())).thenAnswer(i -> { ShoppingRequestLog receipt=new ShoppingRequestLog();receipt.setRequestHash(i.getArgument(2));receipt.setResponseJson(i.getArgument(3));receipts.put(i.getArgument(1),receipt);return 1; });
        }
        JsonNode result(ShoppingSyncResponse response) { return json.valueToTree(response); }
    }
    @Test void sourceCountsPersistWithListAndReplayWithoutAnotherWrite() throws Exception {
        Fixture f=new Fixture(); ShoppingSyncResponse first=f.service.batchAdd(3L,f.request);
        assertEquals(6,f.result(first).path("addedItemCount").asInt(-1)); assertEquals(2,f.result(first).path("mergedItemCount").asInt(-1));
        JsonNode stored=f.json.readTree(f.receipts.get(f.request.getRequestId()).getResponseJson());
        assertEquals(2,stored.path("schemaVersion").asInt());assertEquals(6,stored.path("addedItemCount").asInt());assertEquals(3,stored.path("list").path("version").asInt());
        ShoppingSyncResponse replay=f.service.batchAdd(3L,f.request); assertTrue(replay.isIdempotent());assertEquals(6,f.result(replay).path("addedItemCount").asInt(-1));assertEquals(2,f.result(replay).path("mergedItemCount").asInt(-1));
        verify(f.items,times(6)).insert(any()); verify(f.items,times(1)).update(argThat(i->Boolean.TRUE.equals(i.getChecked())),eq(1L));
        assertTrue(ShoppingListService.class.getMethod("batchAdd",Long.class,ShoppingBatchAddRequest.class).isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));
    }
    @Test void oldBareListReplaysWithUnknownCountsAndNoWrites() throws Exception {
        Fixture f=new Fixture(); ShoppingListResponse list=new ShoppingListResponse();list.setVersion(3L);
        ShoppingRequestLog old=new ShoppingRequestLog();old.setResponseJson(f.json.writeValueAsString(list));old.setRequestHash(com.eatwhat.util.WorkflowRequestHash.sha256("ShoppingBatchAddRequest|"+f.json.writeValueAsString(f.request)));f.receipts.put(f.request.getRequestId(),old);
        ShoppingSyncResponse replay=f.service.batchAdd(3L,f.request);assertEquals(3L,replay.getList().getVersion());assertTrue(replay.isIdempotent());assertTrue(f.result(replay).path("addedItemCount").isNull());assertTrue(f.result(replay).path("mergedItemCount").isNull());verifyNoInteractions(f.items);
    }
    @Test void receiptPersistenceFailureFailsOperationAndCorruptReceiptNeverRepeatsWrites() throws Exception {
        Fixture f=new Fixture();when(f.logs.insertBoundSuccess(anyLong(),anyString(),anyString(),anyString())).thenThrow(new IllegalStateException("log failed"));assertThrows(IllegalStateException.class,()->f.service.batchAdd(3L,f.request));
        Fixture corrupt=new Fixture();ShoppingRequestLog log=new ShoppingRequestLog();log.setRequestHash(com.eatwhat.util.WorkflowRequestHash.sha256("ShoppingBatchAddRequest|"+corrupt.json.writeValueAsString(corrupt.request)));log.setResponseJson("{\"schemaVersion\":99}");corrupt.receipts.put(corrupt.request.getRequestId(),log);
        assertThrows(IllegalStateException.class,()->corrupt.service.batchAdd(3L,corrupt.request));verifyNoInteractions(corrupt.items);
    }
}
