package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MealWorkspacePlannerTest {
    @Test void manualSelectionCannotSkipUninterpretedTemporaryRequirement() {
        MealWorkspace w=workspace("lunch");w.getContext().setRequirements("本餐不吃花生");
        MealWorkspacePlanner p=planner(Arrays.asList(dish(1,"meat",""),dish(2,"veg","")));
        assertThrows(IllegalArgumentException.class,()->p.generate(1L,w,"select",null,Arrays.asList(1L,2L)));
    }
    private Dish dish(long id,String type,String tags) {Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType(type);d.setTagCodes(tags);d.setCookMinutes(10);return d;}
    private MealWorkspacePlanner planner(List<Dish> pool) {DishCandidateQueryService q=mock(DishCandidateQueryService.class);when(q.findForUser(anyLong(),isNull(),isNull(),any(),anyInt())).thenReturn(new ArrayList<>(pool));UserPreferenceService prefs=mock(UserPreferenceService.class);when(prefs.get(1L)).thenReturn(new UserPreferenceDTO());return new MealWorkspacePlanner(q,mock(DishMapper.class),prefs,new RecommendationMetadataService(mock(DishMapper.class)),mock(FavoriteDishService.class),mock(com.eatwhat.mapper.MealConsumptionMapper.class),new com.fasterxml.jackson.databind.ObjectMapper());}
    private MealWorkspace workspace(String meal) {MealContext c=new MealContext();c.setDate("2026-10-03");c.setMealType(meal);MealWorkspace w=new MealWorkspace();w.setContext(MealWorkspaceRules.normalize(c));return w;}
    @Test void validatingAgentResultDoesNotChangeTheWorkspaceCompositionMode() {
        MealWorkspace w=workspace("lunch");MealWorkspacePlanner p=planner(Arrays.asList(dish(1,"meat",""),dish(2,"veg","")));
        p.validateAgent(1L,w,Arrays.asList(1L,2L));assertEquals("auto",w.getContext().getCompositionMode());
    }
    @Test void breakfastOnlyUsesApprovedCandidatesAndInsufficientPoolPreservesDraft() {
        MealWorkspace w=workspace("breakfast");MealWorkspacePlanner p=planner(Arrays.asList(dish(1,"staple","BREAKFAST_ELIGIBLE"),dish(2,"veg","BREAKFAST_ELIGIBLE"),dish(3,"meat","")));
        PlanDraft draft=p.generate(1L,w,"generate",null,null);assertEquals(2,draft.getDishes().size());assertFalse(draft.getDishes().stream().anyMatch(d->d.getId()==3L));
        w.setDraft(draft);w.getDraft().getLockedDishIds().add(1L);w.getContext().setPeople(6);
        assertThrows(IllegalArgumentException.class,()->p.generate(1L,w,"regenerate",null,null));assertEquals(2,w.getDraft().getDishes().size());
    }
    @Test void wholeMealTimeAndLockedDishAreNeverSilentlyRelaxed() {
        MealWorkspace w=workspace("lunch");w.getContext().setTotalCookMinutes(15);MealWorkspacePlanner p=planner(Arrays.asList(dish(1,"meat",""),dish(2,"veg","")));
        assertThrows(IllegalArgumentException.class,()->p.generate(1L,w,"generate",null,null));assertEquals(0,w.getDraft().getPlanVersion());
    }
}
