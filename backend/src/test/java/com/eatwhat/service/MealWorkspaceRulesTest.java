package com.eatwhat.service;

import com.eatwhat.dto.MealContext;
import com.eatwhat.dto.PlanDraft;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class MealWorkspaceRulesTest {
    @Test void oldDraftCannotBeConfirmedAfterContextChangeOrUndoAcrossContexts() {
        MealContext c=new MealContext();c.setDate("2026-10-03");MealWorkspaceRules.normalize(c);
        PlanDraft draft=new PlanDraft();draft.setContextFingerprint(MealWorkspaceRules.contextFingerprint(c));
        assertTrue(MealWorkspaceRules.matchesContext(draft,c));c.setPeople(4);MealWorkspaceRules.normalize(c);
        assertFalse(MealWorkspaceRules.matchesContext(draft,c));
    }
    @Test void databaseJsonKeyOrderDoesNotInvalidateAnUnchangedContext() {
        MealContext c=new MealContext();c.setDate("2026-10-03");MealWorkspaceRules.normalize(c);
        String original=MealWorkspaceRules.contextFingerprint(c);
        Map<String,Integer> reordered=new LinkedHashMap<>();reordered.put("veg",1);reordered.put("meat",1);c.setCounts(reordered);
        assertEquals(original,MealWorkspaceRules.contextFingerprint(c));
    }
    @Test void automaticLunchAndBreakfastUseIndependentTemplates() {
        MealContext c = new MealContext(); c.setDate("2026-10-03"); c.setMealType("lunch"); c.setPeople(2);
        assertEquals(Integer.valueOf(1), MealWorkspaceRules.normalize(c).getCounts().get("meat"));
        c.setPeople(6);
        assertEquals(Integer.valueOf(2), MealWorkspaceRules.normalize(c).getCounts().get("meat"));
        c.setMealType("breakfast");
        assertEquals(Integer.valueOf(2), MealWorkspaceRules.normalize(c).getCounts().get("staple"));
        assertEquals(Integer.valueOf(2), c.getCounts().get("side"));
        c.setPeople(50); c.setMealType("dinner");
        assertEquals(10, MealWorkspaceRules.normalize(c).getCounts().values().stream().mapToInt(Integer::intValue).sum());
    }
    @Test void manualCountsSurvivePeopleChangeAndPeopleOutsideRangeAreRejected() {
        MealContext c = new MealContext(); c.setDate("2026-10-03"); c.setCompositionMode("manual");
        c.getCounts().put("meat",3); c.setPeople(4); MealWorkspaceRules.normalize(c);
        c.setPeople(6); assertEquals(Integer.valueOf(3),MealWorkspaceRules.normalize(c).getCounts().get("meat"));
        c.setPeople(51); assertThrows(IllegalArgumentException.class,()->MealWorkspaceRules.normalize(c));
    }
    @Test void lockAndUndoPreserveSnapshotAndAdvanceVersion() {
        Dish a=new Dish(); a.setId(1L); a.setName("番茄炒蛋"); a.setType("veg");
        Dish b=new Dish(); b.setId(2L); b.setName("青菜"); b.setType("veg");
        PlanDraft p=new PlanDraft(); p.setDishes(Arrays.asList(a)); p.setPlanVersion(3L);
        p=MealWorkspaceRules.command(p,"keep",1L,null);
        PlanDraft locked=p;
        assertThrows(IllegalArgumentException.class,()->MealWorkspaceRules.command(locked,"replace",1L,b));
        p=MealWorkspaceRules.command(p,"release",1L,null);
        p=MealWorkspaceRules.command(p,"replace",1L,b);
        long version=p.getPlanVersion(); p=MealWorkspaceRules.command(p,"undo",null,null);
        assertEquals(1L,p.getDishes().get(0).getId()); assertEquals(version+1,p.getPlanVersion());
        assertTrue(p.getHistory().size()<=10);
    }
    @Test void unknownDurationDoesNotProduceWholeMealEstimate() {
        Dish a=new Dish();a.setCookMinutes(10); Dish b=new Dish();
        assertNull(MealWorkspaceRules.totalMinutes(Arrays.asList(a,b)));
        b.setCookMinutes(15);assertEquals(Integer.valueOf(25),MealWorkspaceRules.totalMinutes(Arrays.asList(a,b)));
    }
}
