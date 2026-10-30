package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.DraftIntent;
import java.util.*;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AssistantPeoplePreservationTest {
    AssistantWorkspaceActionTest.DraftFixture fixture(String source) throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=new AssistantWorkspaceActionTest.DraftFixture();
        f.pool.get(0).setType("meat");CanonicalTestDish.attach(f.pool.get(0));
        MealWorkspace w=f.service.get(1L,"source");w.getContext().setCompositionMode("auto");w.getContext().setPeople(2);w.getContext().setRecommendationPolicy("balanced-v1");MealWorkspaceRules.normalize(w.getContext());
        w.getDraft().setDishes(new ArrayList<>(f.pool.subList(0,2)));w.getDraft().setLockedDishIds(new LinkedHashSet<>());w.getDraft().setSource(source);w.getDraft().setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));w.getDraft().setRequirementsFingerprint(MealWorkspaceRules.requirementsFingerprint(w.getContext()));f.f.sourceJson=f.f.json.writeValueAsString(w);return f;
    }
    private DraftIntent people(List<Long> selected){DraftIntent change=new DraftIntent();change.setOperation("adjust");change.setSelectionMode(selected==null?"recommend":"explicit");change.setContextPatch(Collections.singletonMap("people",3));change.setSelectedDishIds(selected);return change;}
    @Test void explicitSameIdsPeopleChangeMatchesOmittedIdsAndKeepsOriginWithoutUndo() throws Exception {
        for(String source:Arrays.asList("assistant","manual"))for(List<Long> selected:Arrays.asList(null,Arrays.asList(1L,2L))){
            AssistantWorkspaceActionTest.DraftFixture f=fixture(source);MealWorkspace before=f.service.get(1L,"source");String original=f.f.json.writeValueAsString(before.getDraft().getDishes());
            DraftIntent change=people(selected);MealWorkspace next=assertDoesNotThrow(()->f.apply(change,"people-original-ids"));assertEquals(3,next.getContext().getPeople());assertEquals(before.getContext().getCounts(),next.getContext().getCounts(),"Diners must not silently add an automatic composition slot");assertEquals(before.getContext().getCompositionMode(),next.getContext().getCompositionMode());assertEquals(original,f.f.json.writeValueAsString(next.getDraft().getDishes()));assertEquals(source,next.getDraft().getSource());assertEquals(before.getDraft().getPlanVersion()+1,next.getDraft().getPlanVersion());assertEquals(before.getRevision()+1,next.getRevision());assertEquals(before.getRecommendationCycle(),next.getRecommendationCycle());assertEquals(next.getRevision(),f.apply(change,"people-original-ids").getRevision());
            assertFalse(next.getDraft().isCanUndo());assertTrue(next.getDraft().getHistory().isEmpty());DraftIntent undo=new DraftIntent();undo.setOperation("undo");assertThrows(IllegalArgumentException.class,()->f.apply(undo,"undo-people-original-ids"));assertEquals(3,f.service.get(1L,"source").getContext().getPeople());
        }
    }
    @Test void differentOrReorderedIdsAreNotSilentlyAcceptedAsPreservedDishes() throws Exception {
        for(List<Long> selected:Arrays.asList(Arrays.asList(1L,4L),Arrays.asList(2L,1L))){AssistantWorkspaceActionTest.DraftFixture f=fixture("manual");assertThrows(IllegalArgumentException.class,()->f.apply(people(selected),"not-the-original-menu"));assertEquals(Arrays.asList(1L,2L),f.service.get(1L,"source").getDraft().getDishes().stream().map(d->d.getId()).collect(Collectors.toList()));}
        AssistantWorkspaceActionTest.DraftFixture f=fixture("manual");MealWorkspace changed=f.apply(people(Arrays.asList(1L,2L,4L)),"real-new-selection");assertEquals(Arrays.asList(1L,2L,4L),changed.getDraft().getDishes().stream().map(d->d.getId()).collect(Collectors.toList()));assertEquals("assistant",changed.getDraft().getSource());
    }
    @Test void originalIdsDoNotBypassCurrentRecipeSnapshotValidation() throws Exception {
        AssistantWorkspaceActionTest.DraftFixture f=fixture("assistant");f.pool.get(0).setName("内容已经更新");CanonicalTestDish.attach(f.pool.get(0));assertThrows(MealConsumptionService.VersionConflict.class,()->f.apply(people(Arrays.asList(1L,2L)),"changed-recipe-original-ids"));
    }
    @Test void consecutivePeopleChangesNeverCreateMenuUndo() throws Exception {
        for(String source:Arrays.asList("assistant","manual")){
            AssistantWorkspaceActionTest.DraftFixture f=fixture(source);MealWorkspace first=f.apply(people(Arrays.asList(1L,2L)),"first-sharing");DraftIntent four=people(Arrays.asList(1L,2L));four.setContextPatch(Collections.singletonMap("people",4));f.apply(four,"second-sharing");DraftIntent undo=new DraftIntent();undo.setOperation("undo");
            assertThrows(IllegalArgumentException.class,()->f.apply(undo,"undo-second-sharing"));MealWorkspace current=f.service.get(1L,"source");assertEquals(4,current.getContext().getPeople());assertEquals(first.getContext().getCounts(),current.getContext().getCounts());assertEquals("auto",current.getContext().getCompositionMode());assertFalse(current.getDraft().isCanUndo());assertTrue(current.getDraft().getHistory().isEmpty());assertEquals(source,current.getDraft().getSource());
        }
    }
    @Test void peopleThenLockChangesRemainNonUndoableForBothEntries() throws Exception {
        for(boolean homeUndo:Arrays.asList(false,true)){
            AssistantWorkspaceActionTest.DraftFixture f=fixture("assistant");MealWorkspace first=f.apply(people(null),"sharing-before-keep");DraftIntent keep=new DraftIntent();keep.setOperation("adjust");keep.setKeepDishIds(Collections.singletonList(1L));f.apply(keep,"keep-after-sharing");
            if(homeUndo){MealWorkspace current=f.service.get(1L,"source");WorkspaceRequest request=f.f.request(null,null);request.setRequestId("home-undo-keep");request.setExpectedWorkspaceRevision(current.getRevision());request.setPlanVersion(current.getDraft().getPlanVersion());request.setCommand("undo");assertThrows(IllegalArgumentException.class,()->f.service.mutate(1L,"source","commands",request));}
            else{DraftIntent undo=new DraftIntent();undo.setOperation("undo");assertThrows(IllegalArgumentException.class,()->f.apply(undo,"assistant-undo-keep"));}
            MealWorkspace current=f.service.get(1L,"source");assertEquals(3,current.getContext().getPeople());assertEquals(first.getContext().getCounts(),current.getContext().getCounts());assertFalse(current.getDraft().isCanUndo());
        }
    }
}
