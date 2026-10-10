package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BreakfastManualSelectionTest {
    private static class Fixture {
        final DishMapper dishes = mock(DishMapper.class);
        final UserPreferenceService preferences = mock(UserPreferenceService.class);
        final MealWorkspacePlanner planner;
        Fixture() {
            when(preferences.get(7L)).thenReturn(new UserPreferenceDTO());
            // These are exactly the recipes visible to user 7; another user's recipe is absent.
            when(dishes.selectFilteredCandidates(eq(7L), any(), any(), anyList(), anyList(), any())).thenAnswer(call -> visibleRows());
            when(dishes.lockReadableDishes(anyList(), eq(7L))).thenAnswer(call -> {
                List<Long> ids = call.getArgument(0); return visibleRows().stream().filter(d -> ids.contains(d.getId())).collect(Collectors.toList());
            });
            DishCandidateQueryService candidates = new DishCandidateQueryService(dishes);
            planner = new MealWorkspacePlanner(candidates, dishes, preferences, new RecommendationMetadataService(dishes),
                mock(FavoriteDishService.class), mock(MealConsumptionMapper.class), new ObjectMapper());
        }
        List<Dish> visibleRows() {
            List<Dish> values = new ArrayList<>();
            for (long id = 1; id <= 4; id++) {
                Dish d = new Dish(); d.setId(id); d.setName("真实菜" + id); d.setType(id == 1 ? "staple" : "veg");
                d.setCookMinutes(5); d.setCl(id == 3 ? "花生" : "青菜"); d.setTagCodes("LIGHT");
                if (id == 4) { d.setUserId(7L); d.setIsCustom(1); }
                values.add(d);
            }
            return values;
        }
        MealWorkspace breakfast() {
            MealContext c = new MealContext(); c.setDate("2026-10-10"); c.setMealType("breakfast");
            MealWorkspace w = new MealWorkspace(); w.setContext(MealWorkspaceRules.normalize(c)); return w;
        }
    }
    @Test void explicitBreakfastSelectionCanUseUntaggedReadableRecipesAndConfirm() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        PlanDraft draft = assertDoesNotThrow(() -> f.planner.generate(7L, w, "select", null, Arrays.asList(1L, 2L)));
        assertEquals("manual", draft.getSource()); assertEquals("manual", w.getContext().getCompositionMode());
        assertEquals(10, draft.getTotalCookMinutes()); assertEquals(1, w.getContext().getCounts().get("staple"));
        assertEquals(1, w.getContext().getCounts().get("side")); w.setDraft(draft);
        PlanDraft checked = assertDoesNotThrow(() -> f.planner.lockAndValidate(7L, w, Arrays.asList(1L, 2L)));
        assertEquals(Arrays.asList(1L, 2L), checked.getDishes().stream().map(Dish::getId).collect(Collectors.toList()));
        assertEquals(draft.getContextFingerprint(), checked.getContextFingerprint());
    }
    @Test void explicitBreakfastSelectionMayIncludeOwnCustomRecipe() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        PlanDraft draft = assertDoesNotThrow(() -> f.planner.generate(7L, w, "select", null, Arrays.asList(1L, 4L)));
        assertEquals(7L, draft.getDishes().get(1).getUserId());
    }
    @Test void automaticGenerationCannotUseManualSourceOrManualModeToSkipBreakfastLabels() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        w.getContext().setCompositionMode("manual"); w.getDraft().setSource("manual");
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, w, "generate", null, null));
        assertTrue(w.getDraft().getDishes().isEmpty());
    }
    @Test void agentValidationCannotPretendToBeUserSelection() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        w.getContext().setCompositionMode("manual"); w.getDraft().setSource("manual");
        assertThrows(IllegalArgumentException.class, () -> f.planner.validateAgent(7L, w, Arrays.asList(1L, 2L)));
    }
    @Test void manualBreakfastStillEnforcesExclusionsOwnershipAndWholeMealTime() {
        Fixture f = new Fixture(); MealWorkspace excluded = f.breakfast();
        excluded.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, excluded, "select", null, Arrays.asList(1L, 3L)));
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, f.breakfast(), "select", null, Arrays.asList(1L, 999L)));
        MealWorkspace timed = f.breakfast(); timed.getContext().setTotalCookMinutes(9);
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, timed, "select", null, Arrays.asList(1L, 2L)));
    }
    @Test void confirmationOfAutomaticDraftStillRequiresBreakfastEligibleRecipes() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        w.getDraft().setDishes(f.visibleRows().subList(0, 2)); w.getDraft().setSource("agent");
        assertThrows(IllegalArgumentException.class, () -> f.planner.lockAndValidate(7L, w, Arrays.asList(1L, 2L)));
    }
    @Test void manualBreakfastConfirmationStillRejectsRecipeChanges() {
        Fixture f = new Fixture(); MealWorkspace w = f.breakfast();
        PlanDraft draft = assertDoesNotThrow(() -> f.planner.generate(7L, w, "select", null, Arrays.asList(1L, 2L))); w.setDraft(draft);
        Dish changed = f.visibleRows().get(0); changed.setCl("花生");
        when(f.dishes.lockReadableDishes(anyList(), eq(7L))).thenReturn(Arrays.asList(changed, f.visibleRows().get(1)));
        assertThrows(MealConsumptionService.VersionConflict.class, () -> f.planner.lockAndValidate(7L, w, Arrays.asList(1L, 2L)));
    }
    @Test void clientRequestCannotSupplyTheDurableDraftSource() throws Exception {
        ObjectMapper json = new ObjectMapper().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        WorkspaceRequest request = json.readValue("{\"command\":\"generate\",\"source\":\"manual\",\"draft\":{\"source\":\"manual\"}}", WorkspaceRequest.class);
        assertEquals("generate", request.getCommand());
        assertFalse(json.valueToTree(request).has("source")); assertFalse(json.valueToTree(request).has("draft"));
    }
}
