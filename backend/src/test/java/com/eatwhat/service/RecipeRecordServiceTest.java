package com.eatwhat.service;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.RecipeRecordMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.Calendar;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RecipeRecordServiceTest {

    @Mock
    private RecipeRecordMapper mapper;
    @Mock
    private DishQueryService dishQueryService;
    private RecipeRecordService service;

    @BeforeEach
    void setUp() {
        service = new RecipeRecordService(mapper, dishQueryService);
    }

    @Test
    void saveSetsAuditTimesAndDelegates() {
        RecipeRecord record = new RecipeRecord();
        assertSame(record, service.saveRecipeRecord(record));
        assertNotNull(record.getCreateTime());
        assertNotNull(record.getUpdateTime());
        verify(mapper).insert(record);
    }

    @Test
    void dateLookupHydratesDishNamesInOriginalOrder() {
        RecipeRecord record = new RecipeRecord();
        record.setDishIds(Arrays.asList(2L, 1L, 99L));
        when(mapper.selectByUserAndDate(7L, "2026-07-21")).thenReturn(Collections.singletonList(record));
        when(dishQueryService.getDishesByIds(anyList())).thenReturn(Arrays.asList(
                dish(1L, "one", "meat"), dish(2L, "two", "veg")
        ));

        assertEquals("two,one", service.getRecordsByDate(7L, "2026-07-21").get(0).getDishNames());
    }

    @Test
    void updateAndDeleteResultsReflectAffectedRows() {
        RecipeRecord record = new RecipeRecord();
        when(mapper.update(record)).thenReturn(1);
        assertTrue(service.updateRecipeRecord(record));
        assertNotNull(record.getUpdateTime());

        when(mapper.delete(3L, 7L)).thenReturn(0);
        when(mapper.deleteByDateAndMeal(7L, "2026-07-21", "dinner")).thenReturn(1);
        assertFalse(service.deleteRecipeRecord(3L, 7L));
        assertTrue(service.deleteRecordByDateAndMeal(7L, "2026-07-21", "dinner"));
    }

    @Test
    void statisticsCountRecordedDaysAndDishTypes() throws Exception {
        RecipeRecord first = record("2026-07-20", 1L, 2L, 3L);
        RecipeRecord second = record("2026-07-21", 1L, 2L);
        Date start = new SimpleDateFormat("yyyy-MM-dd").parse("2026-07-20");
        Date end = new SimpleDateFormat("yyyy-MM-dd").parse("2026-07-21");
        when(mapper.selectRecordsByUserAndRange(7L, start, end)).thenReturn(Arrays.asList(first, second));
        when(dishQueryService.getDishesByIds(anyList())).thenReturn(Arrays.asList(
                dish(1L, "pork", "meat"),
                dish(2L, "greens", "veg"),
                dish(3L, "broth", "soup")
        ));

        StatisticsDTO result = service.getStatistics(7L, start, end);
        assertEquals(2, result.getDaysWithRecords());
        assertEquals(2, result.getStatistics().getMeatCount());
        assertEquals(2, result.getStatistics().getVegCount());
        assertEquals(1, result.getStatistics().getSoupCount());
        assertEquals(3, result.getDishes().size());
    }

    @Test
    void recentDishLookupUsesCalendarDayBoundaryAndSkipsMalformedLegacyIds() {
        RecipeRecord legacy = new RecipeRecord();
        legacy.setId(88L);
        legacy.setDishIdsString("[1,\"bad\",\"2\",null]");
        when(mapper.selectRecordsByUserAndRange(eq(7L), any(Date.class), any(Date.class)))
                .thenReturn(Collections.singletonList(legacy));

        Set<Long> result = service.getRecentDishIds(7L, 7);

        assertEquals(new java.util.HashSet<>(Arrays.asList(1L, 2L)), result);
        org.mockito.ArgumentCaptor<Date> start = org.mockito.ArgumentCaptor.forClass(Date.class);
        verify(mapper).selectRecordsByUserAndRange(eq(7L), start.capture(), any(Date.class));
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(start.getValue());
        assertEquals(0, calendar.get(Calendar.HOUR_OF_DAY));
        assertEquals(0, calendar.get(Calendar.MINUTE));
        assertEquals(0, calendar.get(Calendar.SECOND));
        assertEquals(0, calendar.get(Calendar.MILLISECOND));
    }

    private RecipeRecord record(String date, Long... ids) throws Exception {
        RecipeRecord record = new RecipeRecord();
        record.setRecordDate(new SimpleDateFormat("yyyy-MM-dd").parse(date));
        record.setDishIds(Arrays.asList(ids));
        return record;
    }

    private Dish dish(Long id, String name, String type) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setName(name);
        dish.setType(type);
        return dish;
    }
}
