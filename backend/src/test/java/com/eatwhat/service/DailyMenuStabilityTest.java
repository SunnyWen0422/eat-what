package com.eatwhat.service;

import com.eatwhat.dto.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DailyMenuStabilityTest {
    @Test void changing_next_generation_settings_keeps_the_menu_and_allows_current_slot_save() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();
        MealWorkspace before=f.service.get(1L,"source");
        String dishes=f.json.writeValueAsString(before.getDraft().getDishes());
        MealContext next=f.json.convertValue(before.getContext(),MealContext.class);
        next.setRequirements("明天试试清淡些");
        next.setCompositionMode("manual");next.setCounts(Collections.singletonMap("veg",2));
        WorkspaceRequest edit=f.request(null,null);edit.setRequestId("next-settings");edit.setContext(next);
        MealWorkspace changed=f.service.mutate(1L,"source","context",edit);
        assertEquals("draft",changed.getStatus());
        assertEquals(before.getDraft().getPlanVersion(),changed.getDraft().getPlanVersion());
        assertEquals(dishes,f.json.writeValueAsString(changed.getDraft().getDishes()));
        WorkspaceRequest save=f.request(null,null);save.setExpectedWorkspaceRevision(changed.getRevision());
        MealWorkspace saved=f.save(save);
        assertEquals("planned",saved.getStatus());
        assertEquals(before.getContext().getDate(),saved.getConfirmation().get("date"));
        assertEquals(before.getContext().getMealType(),saved.getConfirmation().get("mealType"));
        assertEquals(dishes,f.json.writeValueAsString(saved.getDraft().getDishes()));
    }

    @Test void changing_next_settings_does_not_mark_an_unchanged_saved_menu_unsaved() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();MealWorkspace saved=f.save(f.request(null,null));
        WorkspaceRequest edit=f.request(null,null);edit.setRequestId("saved-next-settings");edit.setExpectedWorkspaceRevision(saved.getRevision());
        MealContext next=f.json.convertValue(saved.getContext(),MealContext.class);next.setOwnedIngredients(Collections.singletonList("番茄"));edit.setContext(next);
        MealWorkspace changed=f.service.mutate(1L,"source","context",edit);
        assertEquals("planned",changed.getStatus());assertEquals(f.json.writeValueAsString(saved.getConfirmation()),f.json.writeValueAsString(changed.getConfirmation()));
        assertEquals(saved.getDraft().getPlanVersion(),changed.getDraft().getPlanVersion());
    }
}
