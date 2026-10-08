package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.ShoppingIngredientKey;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ShoppingExpenseLifecycleTest {
    @Test void omittedLastSourceRemovesExpenseBeforeReceiptAndReaddingDoesNotReviveIt() {
        Fixture f = new Fixture(false);
        ShoppingSyncResponse removed = f.purchase("remove-tomato", Collections.singletonList(f.salt));
        assertFalse(f.storedExpenses.containsKey(f.tomatoKey), "Last-source removal must retire current-list spend");
        assertTrue(removed.getList().getExpenses().isEmpty());
        ShoppingSyncResponse readded = f.purchase("readd-tomato", Arrays.asList(f.salt, f.tomato));
        assertTrue(readded.getList().getDishes().stream().flatMap(d -> d.getItems().stream()).anyMatch(i -> "番茄".equals(i.getCanonicalName())));
        assertFalse(readded.getList().getExpenses().containsKey(f.tomatoKey), "Old amount and channel cannot return");
    }

    @Test void removingOneSourceKeepsExpenseWhenAnotherSourceStillNeedsTheIngredient() {
        Fixture f = new Fixture(true);
        ShoppingSyncResponse result = f.purchase("remove-one-source", Collections.singletonList(f.salt));
        assertEquals(new BigDecimal("12.34"), result.getList().getExpenses().get(f.tomatoKey).getAmount());
        assertEquals("超市", result.getList().getExpenses().get(f.tomatoKey).getChannel());
    }

    private static class Fixture {
        final ShoppingList list = new ShoppingList();
        final Map<Long, ShoppingItem> rows = new LinkedHashMap<>();
        final Map<String, ShoppingExpense> storedExpenses = new LinkedHashMap<>();
        final ShoppingPreviewItemDTO tomato = line(0, "番茄");
        final ShoppingPreviewItemDTO salt = line(1, "盐");
        final String tomatoKey = ShoppingIngredientKey.of(tomato);
        final ShoppingListService service;

        Fixture(boolean anotherSource) {
            ShoppingListMapper lists = mock(ShoppingListMapper.class);
            ShoppingDishMapper groups = mock(ShoppingDishMapper.class);
            ShoppingItemMapper items = mock(ShoppingItemMapper.class);
            ShoppingExpenseMapper expenses = mock(ShoppingExpenseMapper.class);
            ShoppingPreviewService previews = mock(ShoppingPreviewService.class);
            list.setId(1L); list.setVersion(2L);
            when(lists.findByUserId(3L)).thenReturn(list);
            when(lists.findByUserIdForUpdate(3L)).thenReturn(list);
            doAnswer(a -> { list.setVersion(a.getArgument(2)); return 1; }).when(lists).updateVersion(anyLong(), anyLong(), anyLong(), anyInt());
            ShoppingDish group = group(7L);
            List<ShoppingDish> allGroups = new ArrayList<>(Collections.singletonList(group));
            when(groups.findBySelectionKey(1L, "meal-one")).thenReturn(group);
            when(groups.findByListId(1L)).thenReturn(allGroups);
            rows.put(8L, item(8L, 7L, tomato));
            if (anotherSource) { allGroups.add(group(9L)); rows.put(10L, item(10L, 9L, tomato)); }
            when(items.findByListId(1L, "all")).thenAnswer(a -> new ArrayList<>(rows.values()));
            doAnswer(a -> { rows.remove(a.getArgument(0)); return 1; }).when(items).delete(anyLong(), eq(1L));
            when(items.findBySource(anyLong(), anyInt())).thenAnswer(a -> rows.values().stream().filter(i -> i.getShoppingDishId().equals(a.getArgument(0)) && i.getSourceLineNo().equals(a.getArgument(1))).findFirst().orElse(null));
            AtomicLong ids = new AtomicLong(20);
            doAnswer(a -> { ShoppingItem i = a.getArgument(0); i.setId(ids.incrementAndGet()); rows.put(i.getId(), i); return 1; }).when(items).insert(any());
            doAnswer(a -> { ShoppingItem i = a.getArgument(0); rows.put(i.getId(), i); return 1; }).when(items).update(any(), eq(1L));
            ShoppingExpense expense = new ShoppingExpense(); expense.setIngredientKey(tomatoKey); expense.setAmount(new BigDecimal("12.34")); expense.setChannel("超市");
            storedExpenses.put(tomatoKey, expense);
            when(expenses.find(1L)).thenAnswer(a -> new ArrayList<>(storedExpenses.values()));
            doAnswer(a -> { storedExpenses.remove(a.getArgument(1)); return 1; }).when(expenses).delete(eq(1L), anyString());
            ShoppingDishDTO pd = new ShoppingDishDTO(); pd.setItems(Arrays.asList(tomato, salt));
            ShoppingPreviewResponse preview = new ShoppingPreviewResponse(); preview.setDishes(Collections.singletonList(pd));
            when(previews.createPreview(eq(3L), any())).thenReturn(preview);
            service = new ShoppingListService(lists, groups, items, mock(ShoppingRequestLogMapper.class), mock(ShoppingListMergeService.class), previews, new ObjectMapper());
            service.setExpenses(expenses);
        }

        ShoppingSyncResponse purchase(String key, List<ShoppingPreviewItemDTO> selected) {
            ShoppingDishRequest group = new ShoppingDishRequest(); group.setSelectionKey("meal-one"); group.setItems(selected);
            ShoppingBatchAddRequest request = new ShoppingBatchAddRequest(); request.setRequestId(key); request.setExpectedListVersion(list.getVersion()); request.setDishes(Collections.singletonList(group));
            return service.batchAdd(3L, request);
        }
        private static ShoppingPreviewItemDTO line(int number, String name) {
            ShoppingPreviewItemDTO i = new ShoppingPreviewItemDTO(); i.setSourceDishId(9L); i.setSourceLineNo(number); i.setCanonicalName(name); i.setDisplayName(name); i.setQuantityText("1克"); return i;
        }
        private static ShoppingDish group(long id) {
            ShoppingDish d = new ShoppingDish(); d.setId(id); d.setShoppingListId(1L); d.setDishId(9L); d.setDishName("示例菜"); d.setSelectionKey("meal-one"); return d;
        }
        private static ShoppingItem item(long id, long group, ShoppingPreviewItemDTO source) {
            ShoppingItem i = new ShoppingItem(); i.setId(id); i.setShoppingDishId(group); i.setSourceLineNo(source.getSourceLineNo()); i.setCanonicalName(source.getCanonicalName()); i.setDisplayName(source.getDisplayName()); i.setChecked(false); i.setUserOverride(false); return i;
        }
    }
}
