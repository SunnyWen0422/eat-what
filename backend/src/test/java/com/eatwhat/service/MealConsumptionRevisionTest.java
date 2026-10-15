package com.eatwhat.service;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MealConsumptionRevisionTest {
    private final MealConsumptionMapper actuals = mock(MealConsumptionMapper.class);
    private final RecipeRecordMapper plans = mock(RecipeRecordMapper.class);
    private final ObjectMapper json = new ObjectMapper();
    private final MealConsumptionService service = new MealConsumptionService(actuals, plans,
            mock(DishQueryService.class), json, new DietReviewCalculator(json));
    private MealConsumptionRequest request;

    @BeforeEach void setup() {
        when(actuals.lockUser(1L)).thenReturn(1L);
        when(actuals.request(anyLong(), anyString())).thenReturn(null);
        request = new MealConsumptionRequest();
        request.setRequestId("actual-revision-test"); request.setExpectedRevision(0L);
        request.setExpectedPlanRevision(0L); request.setStatus("eaten"); request.setUsePlan(false);
        MealConsumptionRequest.Entry entry = new MealConsumptionRequest.Entry(); entry.setName("外食面条");
        request.setDishes(Collections.singletonList(entry));
    }
    private RecipeRecord slot(long revision, boolean deleted) {
        RecipeRecord slot = new RecipeRecord(); slot.setId(8L); slot.setRevision(revision);
        slot.setIsDeleted(deleted); slot.setMealType("dinner"); slot.setRecordDateString("2026-01-01");
        slot.setRecipeName("计划米饭"); slot.setDishIds(Collections.emptyList());
        when(plans.findSlot(1L,"2026-01-01","dinner")).thenReturn(slot);
        when(plans.slotRevisions(1L,"2026-01-01","2026-01-01")).thenReturn(Collections.singletonList(slot));
        when(plans.selectByUserAndDate(1L,"2026-01-01")).thenReturn(deleted ? Collections.emptyList() : Collections.singletonList(slot));
        return slot;
    }
    private MealConsumption save() { return service.save(1L,"2026-01-01","dinner",request); }

    @Test void firstActualAfterDeletedPlanUsesOverviewTombstoneVersion() {
        slot(2L,true);
        Map<?,?> revisions = (Map<?,?>)service.overview(1L,"2026-01-01","2026-01-01").get("planRevisions");
        request.setExpectedPlanRevision((Long)revisions.get("2026-01-01|dinner"));
        MealConsumption saved = assertDoesNotThrow(this::save);
        assertEquals("外食面条",saved.getActualDishes().get(0).get("name"));
        assertNull(saved.getSourceRecordId()); assertNull(saved.getPlannedSnapshot()); assertEquals(1L,saved.getRevision());
    }
    @Test void firstActualWithoutAnyPlanHistoryUsesZero() {
        assertEquals(1L,save().getRevision());
    }
    @Test void planChangedAfterReadingStillConflicts() {
        for (boolean deleted : Arrays.asList(false,true)) {
            slot(3L,deleted); request.setExpectedPlanRevision(2L);
            assertThrows(MealConsumptionService.VersionConflict.class,this::save);
        }
        verify(actuals,never()).save(any());
    }
    @Test void deletedPlanCannotBeConfirmedAsPlannedEvenWithCurrentVersion() {
        slot(2L,true); request.setExpectedPlanRevision(2L); request.setUsePlan(true);
        assertEquals("本餐没有可确认的安排",assertThrows(IllegalArgumentException.class,this::save).getMessage());
        verify(actuals,never()).save(any());
    }
    @Test void activePlanStillProvidesSnapshot() {
        slot(4L,false); request.setExpectedPlanRevision(4L); request.setUsePlan(true);
        MealConsumption saved = save();
        assertEquals("计划米饭",saved.getActualDishes().get(0).get("name"));
        assertEquals(8L,saved.getSourceRecordId()); assertEquals(4L,((Number)saved.getPlannedSnapshot().get("revision")).longValue());
    }
    @Test void editingExistingActualDoesNotDependOnLaterPlanRevision() {
        MealConsumption current = new MealConsumption(); current.setRevision(1L); current.setStatus("eaten");
        current.setActualDishesJson("[{\"name\":\"旧实吃\"}]"); current.setSourceRecordId(9L);
        current.setPlannedSnapshotJson("{\"name\":\"历史安排\",\"revision\":1}");
        when(actuals.find(1L,"2026-01-01","dinner")).thenReturn(current);
        slot(3L,true); request.setExpectedPlanRevision(1L); request.setExpectedRevision(1L);
        MealConsumption saved = save();
        assertEquals(2L,saved.getRevision()); assertEquals(9L,saved.getSourceRecordId());
        assertEquals("历史安排",saved.getPlannedSnapshot().get("name"));
        assertEquals(false,saved.getPlannedSnapshot().get("confirmedAsPlanned"));
    }
    @Test void committedRequestReplaySurvivesLaterPlanChangeWithoutWritingAgain() {
        slot(2L,true); request.setExpectedPlanRevision(2L);
        doAnswer(call -> {
            Map<String,Object> receipt = new HashMap<>(); receipt.put("requestHash",call.getArgument(2));
            receipt.put("responseJson",call.getArgument(3));
            when(actuals.request(1L,request.getRequestId())).thenReturn(receipt); return null;
        }).when(actuals).log(anyLong(),anyString(),anyString(),anyString());
        MealConsumption first = assertDoesNotThrow(this::save);
        slot(3L,true);
        assertEquals(first.getActualDishes(),save().getActualDishes());
        verify(actuals,times(1)).save(any());
        request.setExpectedPlanRevision(3L);
        assertThrows(MealConsumptionService.VersionConflict.class,this::save);
    }
}
