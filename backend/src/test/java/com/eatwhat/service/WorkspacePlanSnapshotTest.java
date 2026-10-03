package com.eatwhat.service;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.RecipeRecordMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class WorkspacePlanSnapshotTest {
    @Test void changedRecipeCannotSilentlyReplaceTheMenuShownToTheUser() {
        Dish reviewed=new Dish();reviewed.setId(1L);reviewed.setName("原方案");reviewed.setCl("青菜");
        Dish changed=new Dish();changed.setId(1L);changed.setName("原方案");changed.setCl("花生");
        DishQueryService dishes=mock(DishQueryService.class);when(dishes.getDishesByIdsForUser(anyList(),anyLong())).thenReturn(Collections.singletonList(changed));
        RecipeRecordMapper db=mock(RecipeRecordMapper.class);RecipeRecordService service=new RecipeRecordService(db,dishes);
        RecipeRecord r=new RecipeRecord();r.setUserId(1L);r.setRecordDateString("2026-10-03");r.setMealType("lunch");r.setRecipeName("原方案");r.setDishIds(Collections.singletonList(1L));r.setExpectedRevision(0L);
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.saveWorkspaceRecipeRecord(r,Collections.singletonList(reviewed)));
        verify(db,never()).insert(any());
    }
}
