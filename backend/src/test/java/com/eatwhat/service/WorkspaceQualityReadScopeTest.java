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
        final DishQualityService quality = spy(CanonicalTestDish.quality());
        final UserPreferenceService preferences = mock(UserPreferenceService.class);
        final FavoriteDishService favorites = mock(FavoriteDishService.class);
        final MealConsumptionMapper actual = mock(MealConsumptionMapper.class);
        final RecommendationMetadataService metadata = new RecommendationMetadataService(dishes);
        final PersonalMenuService menus = mock(PersonalMenuService.class);
        final MealWorkspacePlanner planner;
        final int count;
        String recipeRevision = "v1";
        Fixture(int count) {
            this.count = count;
            when(preferences.get(7L)).thenReturn(new UserPreferenceDTO());
            when(dishes.selectRecommendationCandidateFacts(anyLong(), any(), any(), anyList(), anyList(), any(),any(),anyInt())).thenAnswer(call -> {
                Long before=call.getArgument(6);int limit=call.getArgument(7);
                assertTrue(limit<=256);
                return rawRows().stream().filter(d->before==null||d.getId()<before)
                    .sorted(Comparator.comparing(Dish::getId).reversed()).limit(limit)
                    .peek(d->d.setSteps(null)).collect(Collectors.toList());
            });
            when(dishes.selectSelectedCandidateFacts(eq(7L),any(),any(),anyList(),anyList(),any(),anyList())).thenAnswer(call->{List<Long> ids=call.getArgument(6);return rawRows().stream().filter(d->ids.contains(d.getId())).collect(Collectors.toList());});
            when(dishes.selectFilteredPageDetails(anyList(),eq(7L))).thenAnswer(call -> {
                List<Long> ids=call.getArgument(0);assertTrue(ids.size()<=256);
                return rawRows().stream().filter(d->ids.contains(d.getId())).collect(Collectors.toList());
            });
            when(dishes.lockReadableDishes(anyList(), eq(7L))).thenAnswer(call -> {
                List<Long> ids = call.getArgument(0); return rawRows().stream().filter(d -> ids.contains(d.getId())).collect(Collectors.toList());
            });
            DishQualityService quality = this.quality;
            DishCandidateQueryService candidates = new DishCandidateQueryService(dishes); candidates.setQuality(quality);
            planner = new MealWorkspacePlanner(candidates, dishes, preferences, metadata, favorites, actual, json); planner.setQuality(quality);
        }
        List<Dish> rawRows() {
            List<Dish> values = new ArrayList<>();
            for (long id = 1; id <= count; id++) {
                Dish d = new Dish(); d.setId(id); d.setName("菜" + id); d.setType("veg"); d.setCl("青菜");
                d.setTagCodes("LIGHT"); d.setCookMinutes(5); d.setSteps("清洗后炒熟"); CanonicalTestDish.attach(d);
                com.fasterxml.jackson.databind.node.ObjectNode recipe=(com.fasterxml.jackson.databind.node.ObjectNode)d.getRecipe();recipe.put("testRevision",recipeRevision);d.setRecipe(recipe);values.add(d);
            }
            return values;
        }
        MealWorkspace workspace() {
            MealContext c = new MealContext(); c.setDate("2026-10-10"); c.setMealType("dinner");
            c.setCompositionMode("manual"); c.setCounts(Collections.singletonMap("veg", 2));
            MealWorkspace w = new MealWorkspace(); w.setContext(MealWorkspaceRules.normalize(c)); return w;
        }
        List<Long> onlyCanonicalEnrichment() {
            @SuppressWarnings("unchecked") ArgumentCaptor<List<Long>> ids = ArgumentCaptor.forClass(List.class);
            ArgumentCaptor<List<Dish>> rows=ArgumentCaptor.forClass(List.class);verify(quality).enrich(rows.capture());verifyNoMoreInteractions(quality);verifyNoInteractions(profiles);return rows.getValue().stream().map(Dish::getId).collect(Collectors.toList());
        }
    }
    @Test void rankingOneThousandEligibleRecipesReadsNoQualityProfiles() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        when(f.favorites.getFavoriteDishIds(7L)).thenReturn(Collections.singletonList(999L));
        List<Dish> rows = f.planner.eligible(7L, w.getContext());
        assertEquals(1000, rows.size()); assertEquals(1L, rows.get(0).getId());verifyNoInteractions(f.favorites);
        assertTrue(rows.stream().allMatch(d -> d.getQuality() == null)); verifyNoInteractions(f.profiles);
    }
    @Test void generationEnrichesOnlyFinalTwoRecipesAndPreservesWholeMealTime() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getContext().setTotalCookMinutes(10);
        PlanDraft draft = f.planner.generate(7L, w, "generate", null, null);
        assertEquals(2, draft.getDishes().size()); assertEquals(10, draft.getTotalCookMinutes());
        assertTrue(draft.getDishes().stream().allMatch(d -> d.getRecipe() != null && d.getQuality() == null));
        assertEquals(draft.getDishes().stream().map(Dish::getId).collect(Collectors.toList()), f.onlyCanonicalEnrichment());
    }
    @Test void replacingOneDishReadsOnlyItsReplacementAndRetainsOtherSnapshot() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        PlanDraft previous = f.planner.generate(7L, w, "generate", null, null); w.setDraft(previous);
        Long target = previous.getDishes().get(0).getId(); Dish retained = previous.getDishes().get(1);
        clearInvocations(f.quality); PlanDraft changed = f.planner.generate(7L, w, "replace", target, null);
        assertEquals(2, changed.getDishes().size()); assertEquals(10, changed.getTotalCookMinutes());
        assertEquals(retained.getContentVersion(), changed.getDishes().get(1).getContentVersion());
        assertNotEquals(target, changed.getDishes().get(0).getId());
        assertEquals(Collections.singletonList(changed.getDishes().get(0).getId()), f.onlyCanonicalEnrichment());
        assertNotNull(changed.getDishes().get(0).getRecipe());assertNull(changed.getDishes().get(0).getQuality());
    }
    @Test void authorizedToolContextEnrichesOnlyTwoHundredIncludingLockedRecipe() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getDraft().getLockedDishIds().add(1000L);
        WorkspaceAgentContextService context = new WorkspaceAgentContextService(f.planner, f.preferences, f.favorites, f.actual, f.menus, f.metadata);
        Map<String, Object> result = context.build(7L, w);
        @SuppressWarnings("unchecked") List<Map<String, Object>> catalog = (List<Map<String, Object>>) result.get("catalog");
        assertEquals(200, catalog.size()); assertEquals(1000L, catalog.get(0).get("id"));
        List<Long> ids = f.onlyCanonicalEnrichment(); assertEquals(200, ids.size()); assertTrue(ids.contains(1000L));
        assertEquals(ids, catalog.stream().map(row -> (Long) row.get("id")).collect(Collectors.toList()));
        for (Map<String, Object> row : catalog) {
            com.fasterxml.jackson.databind.JsonNode facts=((com.fasterxml.jackson.databind.JsonNode)row.get("recipe")).path("ingredients");
            assertEquals(1, facts.size()); assertEquals("青菜", facts.get(0).path("ingredient").path("name").asText());
            assertEquals("exact",facts.get(0).path("quantityKind").asText());assertEquals(100,facts.get(0).path("quantity").asInt());assertFalse(facts.get(0).has("quantityStatus"));
            Long id = (Long) row.get("id"); Dish enriched = f.rawRows().get(id.intValue() - 1);

            assertEquals(enriched.getContentVersion(), row.get("contentVersion"));
        }
    }
    @Test void lockingConfirmationStillRejectsAChangedRecipeRevision() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        PlanDraft reviewed = f.planner.generate(7L, w, "generate", null, null); w.setDraft(reviewed);
        List<Long> selected = reviewed.getDishes().stream().map(Dish::getId).collect(Collectors.toList());
        f.recipeRevision = "v2"; clearInvocations(f.quality);
        assertThrows(MealConsumptionService.VersionConflict.class, () -> f.planner.lockAndValidate(7L, w, selected));
        assertEquals(new HashSet<>(selected), new HashSet<>(f.onlyCanonicalEnrichment())); assertEquals(reviewed, w.getDraft());
    }
    @Test void namedRawCandidateIsRetrievedBeforeTheBoundWithoutEnrichingTheWholePool() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace();
        w.getContext().setRequirements("今晚想吃菜999"); w.getDraft().getLockedDishIds().add(1000L);
        WorkspaceAgentContextService context = new WorkspaceAgentContextService(f.planner, f.preferences, f.favorites, f.actual, f.menus, f.metadata);
        @SuppressWarnings("unchecked") List<Map<String, Object>> catalog = (List<Map<String, Object>>) context.build(7L, w).get("catalog");
        assertEquals(200, catalog.size()); assertEquals(1000L, catalog.get(0).get("id")); assertEquals(999L, catalog.get(1).get("id"));
        List<Long> enriched = f.onlyCanonicalEnrichment(); assertEquals(200, enriched.size());
        assertEquals(catalog.stream().map(row -> (Long) row.get("id")).collect(Collectors.toList()), enriched);
    }
    @Test void impossibleWholeMealTimeDoesNotReadQualityOrMutateDraft() {
        Fixture f = new Fixture(1000); MealWorkspace w = f.workspace(); w.getContext().setTotalCookMinutes(9);
        assertThrows(IllegalArgumentException.class, () -> f.planner.generate(7L, w, "generate", null, null));
        assertEquals(0, w.getDraft().getPlanVersion()); verifyNoInteractions(f.profiles);
    }
}
