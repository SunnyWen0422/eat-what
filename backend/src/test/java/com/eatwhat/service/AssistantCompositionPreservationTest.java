package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.DraftIntent;
import com.eatwhat.entity.Dish;
import java.util.*;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AssistantCompositionPreservationTest {
    private AssistantWorkspaceActionTest.DraftFixture empty() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantPeoplePreservationTest().fixture("assistant");
        MealWorkspace w=f.service.get(1L,"source");
        w.getContext().setCompositionMode("manual");w.getContext().setCounts(counts());
        w.getDraft().setDishes(new ArrayList<>());w.getDraft().setHistory(new ArrayList<>());
        w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));
        f.f.sourceJson=f.f.json.writeValueAsString(w);return f;
    }
    private Map<String,Integer> counts(){Map<String,Integer> values=new LinkedHashMap<>();values.put("meat",1);values.put("veg",1);return values;}
    private DraftIntent intent(String operation,Map<String,Object> patch){DraftIntent i=new DraftIntent();i.setOperation(operation);i.setSelectionMode("recommend");i.setContextPatch(patch);return i;}
    private void oneMeatOneVegetable(MealWorkspace w){assertEquals("manual",w.getContext().getCompositionMode());assertEquals(counts(),w.getContext().getCounts());assertEquals(Arrays.asList("meat","veg"),w.getDraft().getDishes().stream().map(Dish::getType).sorted().collect(Collectors.toList()));}

    @Test void explicitCountsOverrideRedundantAutoAndSurviveSharingThenNewAllergyMenu() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=empty();
        Map<String,Object> patch=new LinkedHashMap<>();patch.put("counts",counts());patch.put("people",2);patch.put("compositionMode","auto");
        MealWorkspace generated=f.apply(intent("generate",patch),"explicit-composition");
        oneMeatOneVegetable(generated);assertFalse(generated.getDraft().isCanUndo());
        String fixedRecipes=f.f.json.writeValueAsString(generated.getDraft().getDishes());
        MealWorkspace shared=f.apply(intent("adjust",Collections.singletonMap("people",3)),"share-same-composition");
        oneMeatOneVegetable(shared);assertEquals(3,shared.getContext().getPeople());
        assertEquals(fixedRecipes,f.f.json.writeValueAsString(shared.getDraft().getDishes()));
        assertFalse(shared.getDraft().isCanUndo());assertTrue(shared.getDraft().getHistory().isEmpty());
        MealWorkspace light=f.apply(intent("adjust",Collections.singletonMap("recommendationPreferences",Collections.singletonMap("includeTagCodes",Collections.singletonList("LIGHT")))),"next-light-composition");
        assertEquals(fixedRecipes,f.f.json.writeValueAsString(light.getDraft().getDishes()));assertFalse(light.getDraft().isCanUndo());
        MealWorkspace regenerated=f.apply(intent("regenerate",Collections.singletonMap("criteria",Collections.singletonMap("excludedIngredients",Collections.singletonList("花生")))),"allergy-same-composition");
        oneMeatOneVegetable(regenerated);assertEquals(3,regenerated.getContext().getPeople());
        assertEquals(Collections.singletonList("花生"),regenerated.getContext().getCriteria().getExcludedIngredients());
        assertEquals(Collections.singletonList("LIGHT"),regenerated.getContext().getRecommendationPreferences().getIncludeTagCodes());
    }

    @Test void suppliedCountsWithoutModeAlsoSelectManualComposition() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=empty();
        MealWorkspace w=f.service.get(1L,"source");w.getContext().setCompositionMode("auto");f.f.sourceJson=f.f.json.writeValueAsString(w);
        MealWorkspace generated=f.apply(intent("generate",AssistantV4ContextService.map("counts",counts(),"people",4)),"counts-without-mode");
        oneMeatOneVegetable(generated);assertEquals(4,generated.getContext().getPeople());
    }

    @Test void genuineAutoWithoutCountsStillUsesAutomaticComposition() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=empty();
        MealWorkspace automatic=f.apply(intent("generate",AssistantV4ContextService.map("compositionMode","auto","people",3)),"genuine-auto");
        assertEquals("auto",automatic.getContext().getCompositionMode());
        assertEquals(1,automatic.getContext().getCounts().get("meat"));assertEquals(2,automatic.getContext().getCounts().get("veg"));
        assertEquals(3,automatic.getDraft().getDishes().size());
    }

    @Test void autoCannotHideInvalidExplicitCounts() throws Exception {
        for(Map<String,Integer> invalid:Arrays.asList(Collections.<String,Integer>emptyMap(),Collections.singletonMap("veg",-1))){
            AssistantWorkspaceActionTest.DraftFixture f=empty();
            assertThrows(IllegalArgumentException.class,()->f.apply(intent("generate",AssistantV4ContextService.map("compositionMode","auto","counts",invalid)),"invalid-explicit-counts"));
            assertTrue(f.service.get(1L,"source").getDraft().getDishes().isEmpty());
        }
    }
}
