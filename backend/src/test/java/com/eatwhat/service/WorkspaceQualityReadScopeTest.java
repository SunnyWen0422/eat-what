package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkspaceQualityReadScopeTest {
    private static class Fixture {
        final ObjectMapper json = new ObjectMapper();
        final DishMapper dishes = mock(DishMapper.class);
        final DishQualityMapper profiles = mock(DishQualityMapper.class);
        final UserPreferenceService preferences = mock(UserPreferenceService.class);
        final FavoriteDishService favorites = mock(FavoriteDishService.class);
        final MealConsumptionMapper actual = mock(MealConsumptionMapper.class);
        final RecommendationMetadataService metadata = new RecommendationMetadataService(dishes);
        final PersonalMenuService menus = mock(PersonalMenuService.class);
        final MealWorkspacePlanner planner;
        final int count;
        String qualityRevision = "v1";
        Fixture(int count) {
            this.count = count;
            when(preferences.get(7L)).thenReturn(new UserPreferenceDTO());
            when(dishes.selectFilteredCandidates(anyLong(), any(), any(), anyList(), anyList(), any())).thenAnswer(call -> rawRows());
            when(dishes.lockReadableDishes(anyList(), eq(7L))).thenAnswer(call -> {
                List<Long> ids = call.getArgument(0); return rawRows().stream().filter(d -> ids.contains(d.getId())).collect(Collectors.toList());
            });
            when(profiles.find(anyList())).thenAnswer(call -> {
                List<Long> ids = call.getArgument(0); List<DishQualityMapper.Row> result = new ArrayList<>();
                for (Long id : ids) {
                    CatalogQuality q = new CatalogQuality(); q.setDishId(id); q.setReviewStatus("UNREVIEWED");
                    q.setContentHash("profile-" + id + "-" + qualityRevision); q.setDatasetVersion("dataset-v1");
                    CatalogQuality.Ingredient ingredient = new CatalogQuality.Ingredient();
                    ingredient.setName("青菜"); ingredient.setUnit("克"); ingredient.setIdentityStatus("VERIFIED");
                    ingredient.setQuantityStatus("VERIFIED"); ingredient.setQuantityValue(new BigDecimal("999"));
                    q.setIngredients(Collections.singletonList(ingredient));
                    DishQualityMapper.Row row = new DishQualityMapper.Row(); row.setDishId(id); row.setProfileJson(json.writeValueAsString(q)); result.add(row);
                }
                return result;
            });
            DishQualityService quality = new DishQualityService(profiles, json);
            DishCandidateQueryService candidates = new DishCandidateQueryService(dishes); candidates.setQuality(quality);
            planner = new MealWorkspacePlanner(candidates, dishes, preferences, metadata, favorites, actual, json); planner.setQuality(quality);
        }
        List<Dish> rawRows() {
            List<Dish> values = new ArrayList<>();
            for (long id = 1; id <= count; id++) {
                Dish d = new Dish(); d.setId(id); d.setName("菜" + id); d.setType("veg"); d.setCl("青菜");
                d.setTagCodes("LIGHT"); d.setCookMinutes(5); d.setSteps("清洗后炒熟"); values.add(d);
            }
            return values;
        }
        MealWorkspace workspace() {
            MealContext c = new MealContext(); c.setDate("2026-10-10"); c.setMealType("dinner");
            c.setCompositionMode("manual"); c.setCounts(Collections.singletonMap("veg", 2));
            MealWorkspace w = new MealWorkspace(); w.setContext(MealWorkspaceRules.normalize(c)); return w;
        }
        List<Long> onlyQualityRead() {
            @SuppressWarnings("unchecked") ArgumentCaptor<List<Long>> ids = ArgumentCaptor.forClass(List.class);
            verify(profiles).find(ids.capture()); verifyNoMoreInteractions(profiles); return ids.getValue();
        }
    }
    @Test void rankingOneThousandEligibleRecipesReadsNoQualityProfiles() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        when(f.favorites.getFavoriteDishIds(7L)).thenReturn(Collections.singletonList(999L));
        List<Dish> rows = f.planner.eligible(7L, w.getContext());
        assertEquals(1000, rows.size()); assertEquals(999L, rows.get(0).getId());
        assertTrue(rows.stream().allMatch(d -> d.getQuality() == null)); verifyNoInteractions(f.profiles);
    }
    @Test void generationEnrichesOnlyFinalTwoRecipesAndPreservesWholeMealTime() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getContext().setTotalCookMinutes(10);
        PlanDraft draft = f.planner.generate(7L, w, "generate", null, null);
        assertEquals(2, draft.getDishes().size()); assertEquals(10, draft.getTotalCookMinutes());
        assertTrue(draft.getDishes().stream().allMatch(d -> d.getQuality() != null));
        assertEquals(draft.getDishes().stream().map(Dish::getId).collect(Collectors.toList()), f.onlyQualityRead());
    }
    @Test void replacingOneDishReadsOnlyItsReplacementAndRetainsOtherSnapshot() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        PlanDraft previous = f.planner.generate(7L, w, "generate", null, null); w.setDraft(previous);
        Long target = previous.getDishes().get(0).getId(); Dish retained = previous.getDishes().get(1);
        clearInvocations(f.profiles); PlanDraft changed = f.planner.generate(7L, w, "replace", target, null);
        assertEquals(2, changed.getDishes().size()); assertEquals(10, changed.getTotalCookMinutes());
        assertEquals(retained.getContentVersion(), changed.getDishes().get(1).getContentVersion());
        assertNotEquals(target, changed.getDishes().get(0).getId());
        assertEquals(Collections.singletonList(changed.getDishes().get(0).getId()), f.onlyQualityRead());
        assertNotNull(changed.getDishes().get(0).getQuality());
    }
    @Test void authorizedToolContextEnrichesOnlyTwoHundredIncludingLockedRecipe() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getDraft().getLockedDishIds().add(1000L);
        WorkspaceAgentContextService context = new WorkspaceAgentContextService(f.planner, f.preferences, f.favorites, f.actual, f.menus, f.metadata);
        Map<String, Object> result = context.build(7L, w);
        @SuppressWarnings("unchecked") List<Map<String, Object>> catalog = (List<Map<String, Object>>) result.get("catalog");
        assertEquals(200, catalog.size()); assertEquals(1000L, catalog.get(0).get("id"));
        List<Long> ids = f.onlyQualityRead(); assertEquals(200, ids.size()); assertTrue(ids.contains(1000L));
        assertEquals(ids, catalog.stream().map(row -> (Long) row.get("id")).collect(Collectors.toList()));
        for (Map<String, Object> row : catalog) {
            @SuppressWarnings("unchecked") List<Map<String, Object>> facts = (List<Map<String, Object>>) row.get("ingredientFacts");
            assertEquals(1, facts.size()); assertEquals("青菜", facts.get(0).get("name"));
            assertEquals("UNKNOWN", facts.get(0).get("quantityStatus")); assertNull(facts.get(0).get("quantityValue"));
            Long id = (Long) row.get("id"); Dish enriched = f.rawRows().get(id.intValue() - 1);
            CatalogQuality q = new CatalogQuality(); q.setContentHash("profile-" + id + "-v1"); enriched.setQuality(q);
            assertEquals(enriched.getContentVersion(), row.get("contentVersion"));
        }
    }
    @Test void lockingConfirmationStillRejectsAChangedQualityRevision() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        PlanDraft reviewed = f.planner.generate(7L, w, "generate", null, null); w.setDraft(reviewed);
        List<Long> selected = reviewed.getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        f.qualityRevision = "v2"; clearInvocations(f.profiles);
        assertThrows(MealConsumptionService.VersionConflict.class, () -> f.planner.lockAndValidate(7L, w, selected));
        assertEquals(new HashSet<>(selected), new HashSet<>(f.onlyQualityRead())); assertEquals(reviewed, w.getDraft());
    }
    @Test void impossibleWholeMealTimeDoesNotReadQualityOrMutateDraft() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getContext().setTotalCookMinutes(9);
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, w, "generate", null, null));
        assertEquals(0, w.getDraft().getPlanVersion()); verifyNoInteractions(f.profiles);
    }
}
