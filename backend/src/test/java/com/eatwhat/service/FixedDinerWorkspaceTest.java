package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.DraftIntent;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FixedDinerWorkspaceTest {
    @Test void assistant_keep_and_single_replace_do_not_apply_pending_composition_to_the_whole_menu() throws Exception {
        for(boolean replace:Arrays.asList(false,true))for(boolean legacy:Arrays.asList(false,true)){
            AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
            MealWorkspace w=f.service.get(1L,"source");w.getContext().setRecommendationPolicy(legacy?null:"balanced-v1");
            w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));
            w.getContext().setCounts(Collections.singletonMap("veg",2));f.f.sourceJson=f.f.json.writeValueAsString(w);
            DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setSelectionMode("recommend");
            if(replace)change.setTargetDishId(2L);else change.setKeepDishIds(Collections.singletonList(1L));
            MealWorkspace updated=f.apply(change,replace?"replace-with-next-counts":"keep-with-next-counts");
            assertEquals(3,updated.getDraft().getDishes().size());
            assertEquals(1L,updated.getDraft().getDishes().get(0).getId());assertEquals(3L,updated.getDraft().getDishes().get(2).getId());
            if(replace)assertNotEquals(2L,updated.getDraft().getDishes().get(1).getId());
            else assertEquals(2L,updated.getDraft().getDishes().get(1).getId());
        }
    }
    @Test void assistant_diner_change_after_editing_next_preferences_does_not_regenerate() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        MealWorkspace w=f.service.get(1L,"source");w.getContext().setRecommendationPolicy("balanced-v1");
        w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));
        w.getContext().setRequirements("下次少油");w.getContext().setCounts(Collections.singletonMap("veg",2));
        f.f.sourceJson=f.f.json.writeValueAsString(w);
        DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setContextPatch(Collections.singletonMap("people",8));
        MealWorkspace updated=f.apply(change,"sharing-with-next-preferences");
        assertEquals(f.f.json.writeValueAsString(w.getDraft().getDishes()),f.f.json.writeValueAsString(updated.getDraft().getDishes()));
        assertEquals(8,updated.getContext().getPeople());assertEquals("下次少油",updated.getContext().getRequirements());
    }
    @Test void assistant_preserves_manual_breakfast_origin_through_people_and_confirm_without_config_undo() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        MealWorkspace original=f.service.get(1L,"source");original.getContext().setMealType("breakfast");
        original.getContext().setRecommendationPolicy("balanced-v1");original.getDraft().setSource("manual");
        original.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(original.getContext()));
        f.f.sourceJson=f.f.json.writeValueAsString(original);f.f.reviewed.clear();f.f.reviewed.addAll(f.pool.subList(0,3));
        DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setContextPatch(Collections.singletonMap("people",8));
        MealWorkspace updated=f.apply(change,"manual-share-eight");
        assertEquals("manual",updated.getDraft().getSource());
        assertEquals(f.f.json.writeValueAsString(original.getDraft().getDishes()),f.f.json.writeValueAsString(updated.getDraft().getDishes()));
        WorkspaceRequest save=f.f.request(null,null);save.setExpectedWorkspaceRevision(updated.getRevision());save.setPlanVersion(updated.getDraft().getPlanVersion());
        assertEquals("planned",f.service.mutate(1L,"source","confirm",save).getStatus());
        DraftIntent undo=new DraftIntent();undo.setOperation("undo");assertThrows(IllegalArgumentException.class,()->f.apply(undo,"undo-manual-sharing"));
        assertFalse(updated.getDraft().isCanUndo());assertEquals("manual",updated.getDraft().getSource());
        assertEquals(8,f.f.slots.values().iterator().next().getTargetPeople());
    }

    @Test void diner_only_adjustment_still_rejects_changed_recipe_content() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        f.pool.get(0).setName("修改后的菜");CanonicalTestDish.attach(f.pool.get(0));
        DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setContextPatch(Collections.singletonMap("people",8));
        assertThrows(MealConsumptionService.VersionConflict.class,()->f.apply(change,"stale-recipe-sharing"));
    }

    @Test void assistant_diner_only_adjustment_keeps_menu_cycle_without_config_undo() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        MealWorkspace original=f.service.get(1L,"source");
        original.getContext().setRecommendationPolicy("balanced-v1");
        original.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(original.getContext()));
        f.f.sourceJson=f.f.json.writeValueAsString(original);
        DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setContextPatch(Collections.singletonMap("people",8));
        MealWorkspace updated=f.apply(change,"share-eight");
        assertEquals(f.f.json.writeValueAsString(original.getDraft().getDishes()),f.f.json.writeValueAsString(updated.getDraft().getDishes()));
        assertEquals(original.getRecommendationCycle(),updated.getRecommendationCycle());
        assertEquals(8,updated.getContext().getPeople());assertEquals("draft",updated.getStatus());
        assertTrue(MealWorkspaceRules.matchesContext(updated.getDraft(),updated.getContext()));
        assertEquals(updated.getRevision(),f.apply(change,"share-eight").getRevision());
        DraftIntent undo=new DraftIntent();undo.setOperation("undo");assertThrows(IllegalArgumentException.class,()->f.apply(undo,"undo-sharing"));
        assertFalse(updated.getDraft().isCanUndo());assertTrue(updated.getDraft().getHistory().isEmpty());
    }

    @Test void home_diner_change_preserves_valid_menu_and_interpreted_requirements() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();
        MealWorkspace original=f.service.get(1L,"source");original.getContext().setRequirements("不要花生");
        original.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));
        original.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(original.getContext()));
        original.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(original.getContext()));
        f.sourceJson=f.json.writeValueAsString(original);
        WorkspaceRequest request=f.request(null,null);request.setContext(f.json.convertValue(original.getContext(),MealContext.class));request.getContext().setPeople(8);
        MealWorkspace updated=f.service.mutate(1L,"source","context",request);
        assertEquals("draft",updated.getStatus());assertTrue(MealWorkspaceRules.matchesContext(updated.getDraft(),updated.getContext()));
        assertTrue(MealWorkspaceRules.understandsRequirements(updated.getDraft(),updated.getContext()));
        assertEquals(original.getDraft().getPlanVersion()+1,updated.getDraft().getPlanVersion());
        assertTrue(updated.getDraft().getHistory().isEmpty());assertFalse(updated.getDraft().isCanUndo());
        assertEquals(f.json.writeValueAsString(original.getDraft().getDishes()),f.json.writeValueAsString(updated.getDraft().getDishes()));
    }

    @Test void changing_people_keeps_the_existing_menu_even_after_next_settings_change() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();MealWorkspace w=f.service.get(1L,"source");
        w.getContext().getCriteria().setMaxCookMinutes(1);f.sourceJson=f.json.writeValueAsString(w);
        WorkspaceRequest request=f.request(null,null);request.setContext(w.getContext());request.getContext().setPeople(8);
        assertEquals("draft",f.service.mutate(1L,"source","context",request).getStatus());
    }

    @Test void auto_composition_change_keeps_existing_dishes_until_generation() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();MealWorkspace w=f.service.get(1L,"source");
        w.getContext().setCompositionMode("auto");MealWorkspaceRules.normalize(w.getContext());
        w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));f.sourceJson=f.json.writeValueAsString(w);
        WorkspaceRequest request=f.request(null,null);request.setContext(w.getContext());request.getContext().setPeople(8);
        assertEquals("draft",f.service.mutate(1L,"source","context",request).getStatus());
    }
}
