package com.eatwhat.service;

import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MainCatalogPaginationTest {
    private Dish dish(long id, String tags, String ingredients, String amounts) {
        Dish dish = new Dish(); dish.setId(id); dish.setTagCodes(tags);
        dish.setCl(ingredients); dish.setIngredientsAmounts(amounts);
        dish.setSteps("complete instructions " + id); return dish;
    }

    private List<Long> ids(List<Dish> dishes) {
        return dishes.stream().map(Dish::getId).collect(Collectors.toList());
    }

    @Test void pageBoundsAndBlankFiltersAreNormalizedAndEmptyResultsNeverLoadFullRows() {
        DishMapper mapper = mock(DishMapper.class);
        when(mapper.countFilteredDishes(eq(7L), isNull(), isNull(), anyList(), anyList(), isNull())).thenReturn(1);
        when(mapper.selectFilteredDishesPage(eq(7L), isNull(), isNull(), anyList(), anyList(), isNull(), eq(1), eq(0L)))
                .thenReturn(Collections.singletonList(dish(1, null, null, null)));
        DishQueryService query = new DishQueryService(mapper);
        DishPageDTO page = query.getFilteredDishes(7L, "  ", " ", null, -10, -10);
        assertEquals(1, page.getPage()); assertEquals(1, page.getPageSize()); assertEquals(Collections.singletonList(1L), ids(page.getList()));
        DishPageDTO largeSize = query.getFilteredDishes(7L, null, null, null, 2, Integer.MAX_VALUE);
        assertEquals(100, largeSize.getPageSize()); assertTrue(largeSize.getList().isEmpty());
        when(mapper.countFilteredDishes(eq(7L), isNull(), isNull(), anyList(), anyList(), isNull())).thenReturn(0);
        DishPageDTO empty = query.getFilteredDishes(7L, null, null, null, 1, 50);
        assertEquals(0, empty.getTotal()); assertTrue(empty.getList().isEmpty());
        verify(mapper, times(1)).selectFilteredDishesPage(anyLong(), any(), any(), anyList(), anyList(), any(), anyInt(), anyLong());
        verify(mapper, never()).selectFilteredCandidates(anyLong(), any(), any(), anyList(), anyList(), any());
    }

    @Test void latePageRetainsExactTotalWithoutReadingEveryCompleteRecipe() {
        List<Dish> all = new ArrayList<>();
        for (long id = 3200; id >= 1; id--) all.add(dish(id, null, null, null));
        List<List<Long>> fullReads = new ArrayList<>();
        DishMapper mapper = mock(DishMapper.class, call -> {
            switch (call.getMethod().getName()) {
                case "selectFilteredCandidates": fullReads.add(ids(all)); return all;
                case "countFilteredDishes": return 3200;
                case "selectFilteredDishesPage":
                    int offset = ((Number) call.getArgument(7)).intValue();
                    int limit = call.getArgument(6);
                    List<Dish> page = all.subList(offset, Math.min(all.size(), offset + limit));
                    fullReads.add(ids(page)); return page;
                default: return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
            }
        });
        DishQueryService query = new DishQueryService(mapper);
        DishPageDTO page = query.getFilteredDishes(7L, "meat", null, new RecommendationCriteria(), 32, 100);
        assertEquals(3200, page.getTotal()); assertEquals(100, page.getList().size());
        assertEquals(100L, page.getList().get(0).getId()); assertEquals(1L, page.getList().get(99).getId());
        assertEquals(100, fullReads.stream().mapToInt(List::size).sum(), "Only the requested page may load full recipe bodies");
        fullReads.clear();
        DishPageDTO beyond = query.getFilteredDishes(7L, null, null, null, Integer.MAX_VALUE, 100);
        assertEquals(3200, beyond.getTotal()); assertTrue(beyond.getList().isEmpty()); assertTrue(fullReads.isEmpty());
    }

    @Test void exclusionsKeepJavaTokenAndLiteralSubstringSemanticsBeforePagination() {
        List<Dish> all = Arrays.asList(
                dish(12, " LIGHT , SpIcY ", "青菜", null),
                dish(11, "NOT_SPICY,SPICYISH", "青菜", null),
                dish(10, null, null, "[PeAnUt 10g]"),
                dish(9, "LIGHT", "青菜", null),
                dish(8, "LIGHT", "100% 花生", null),
                dish(7, null, null, null),
                dish(6, "SPICY", null, null),
                dish(5, "LIGHT", "red_bean", null),
                dish(4, "LIGHT", "red bean", null),
                dish(3, "LIGHT", "青菜", null));
        List<List<Long>> fullReads = new ArrayList<>();
        DishMapper mapper = mock(DishMapper.class, call -> {
            switch (call.getMethod().getName()) {
                case "selectFilteredCandidates": fullReads.add(ids(all)); return all;
                case "selectFilteredDishFacts": return all;
                case "selectCatalogDishesByIds":
                    List<Long> wanted = call.getArgument(0); fullReads.add(new ArrayList<>(wanted));
                    return all.stream().filter(d -> wanted.contains(d.getId())).collect(Collectors.toList());
                default: return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
            }
        });
        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setExcludeTagCodes(Arrays.asList(null, " spicy ", ""));
        criteria.setExcludedIngredients(Arrays.asList(null, "", " peanut ", "%", "_"));
        DishQueryService query = new DishQueryService(mapper);
        DishPageDTO page = query.getFilteredDishes(7L, null, null, criteria, 2, 2);
        assertEquals(5, page.getTotal()); assertEquals(Arrays.asList(7L, 4L), ids(page.getList()));
        assertEquals("complete instructions 7", page.getList().get(0).getSteps());
        assertEquals(Collections.singletonList(Arrays.asList(7L, 4L)), fullReads);
        fullReads.clear();
        DishPageDTO beyond = query.getFilteredDishes(7L, null, null, criteria, Integer.MAX_VALUE, 100);
        assertEquals(5, beyond.getTotal()); assertTrue(beyond.getList().isEmpty()); assertTrue(fullReads.isEmpty());
    }
}
