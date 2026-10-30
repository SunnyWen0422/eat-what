package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantV4ContextTest {
    @Test void menu_undo_eligibility_is_an_explicit_authoritative_boolean_without_history(){
        Fixture f=new Fixture();PlanDraft old=new PlanDraft();old.setDishes(Collections.singletonList(Fixture.dish(99,"旧菜单")));f.w.getDraft().getHistory().add(old);
        ModelContext unavailable=f.service().build(7L,f.request,f.session);
        assertEquals(false,unavailable.getActiveMeal().get("canUndo"));
        assertFalse(unavailable.getActiveMeal().containsKey("history"));
        f.w.getDraft().setCanUndo(true);ModelContext available=f.service().build(7L,f.request,f.session);
        assertEquals(true,available.getActiveMeal().get("canUndo"));
        assertTrue(f.json.valueToTree(available).path("activeMeal").path("canUndo").isBoolean());
        assertFalse(f.json.valueToTree(available).toString().contains("旧菜单"));
        f.w.getDraft().setCanUndo(false);
        assertFalse(f.json.valueToTree(f.service().build(7L,f.request,f.session)).path("activeMeal").path("canUndo").booleanValue());
    }
    @Test void negotiationMovesSavedTimeToSoftWithoutMutatingLegacyWorkspace(){
        Fixture f=new Fixture();f.preference.setMaxCookMinutes(20);AssistantV4ContextService service=f.service();ModelContext result=service.build(7L,f.request,f.session);
        assertEquals(20,((Map<?,?>)result.getConstraints().get("hard")).get("maxCookMinutes"));service.negotiateBalanced(7L,f.request,result);
        assertNull(((Map<?,?>)result.getConstraints().get("hard")).get("maxCookMinutes"));assertEquals(20,((Map<?,?>)result.getConstraints().get("soft")).get("expectedCookMinutes"));assertNull(f.w.getContext().getRecommendationPolicy());assertEquals(Arrays.asList("花生"),((Map<?,?>)result.getConstraints().get("hard")).get("excludedIngredients"));
    }
    static class Fixture {
        final ObjectMapper json=new ObjectMapper();
        final MealWorkspaceService workspaces=mock(MealWorkspaceService.class);
        final UserPreferenceService preferences=mock(UserPreferenceService.class);
        final MealConsumptionMapper actual=mock(MealConsumptionMapper.class);
        final PersonalMenuService menus=mock(PersonalMenuService.class);
        final RecommendationMetadataService metadata=new RecommendationMetadataService(mock(DishMapper.class));
        final Clock clock=Clock.fixed(Instant.parse("2026-10-11T04:00:00Z"),ZoneId.of("Asia/Shanghai"));
        final MealWorkspace w=new MealWorkspace(); final TurnRequest request=new TurnRequest(); final SessionState session=new SessionState();
        final UserPreferenceDTO preference=new UserPreferenceDTO();
        Fixture(){
            w.setId("workspace-1");w.setRevision(8L);MealContext c=new MealContext();c.setDate("2026-12-25");c.setMealType("dinner");c.setRequirements("不要花生");w.setContext(c);
            w.getDraft().setPlanVersion(4L);w.getDraft().setDishes(Arrays.asList(dish(1,"豆腐"),dish(2,"青菜")));w.getDraft().getLockedDishIds().add(2L);
            request.setWorkspaceId(w.getId());request.setExpectedWorkspaceRevision(8L);request.setExpectedPlanVersion(4L);request.setEntryScene("chat");request.setMessage("看看第二道");
            session.setWorkspaceId(w.getId());session.setUserId(7L);preference.setExcludedIngredients(Arrays.asList("花生"));
            when(workspaces.get(7L,w.getId())).thenReturn(w);when(preferences.get(7L)).thenReturn(preference);when(actual.range(anyLong(),anyString(),anyString())).thenReturn(Collections.emptyList());when(menus.list(7L)).thenReturn(Collections.emptyList());
        }
        AssistantV4ContextService service(){return new AssistantV4ContextService(workspaces,preferences,actual,menus,metadata,json,clock);}
        static Dish dish(long id,String name){Dish d=new Dish();d.setId(id);d.setName(name);d.setType("veg");d.setUserId(7L);d.setCl("青菜");return d;}
    }
    @Test void current_order_versions_now_and_private_fields(){
        Fixture f=new Fixture();ModelContext c=f.service().build(7L,f.request,f.session);
        assertEquals(2L,((Map<?,?>)((List<?>)c.getActiveMeal().get("currentDishes")).get(1)).get("id"));assertEquals(8L,c.getActiveMeal().get("workspaceRevision"));assertEquals(4L,c.getActiveMeal().get("planVersion"));
        assertTrue(c.getRequestContext().get("now").toString().startsWith("2026-10-11"));assertEquals("2026-12-25",((Map<?,?>)c.getRequestContext().get("selectedTarget")).get("date"));
        String encoded=f.json.valueToTree(c).toString();assertFalse(encoded.contains("userId"));assertFalse(encoded.contains("owner"));assertFalse(encoded.contains("token"));
        verify(f.actual).range(7L,"2026-10-05","2026-10-11");
    }
    @Test void plan_is_not_eaten(){
        Fixture f=new Fixture();MealConsumption p=new MealConsumption();p.setStatus("unrecorded");p.setMealDate("2026-10-10");p.setActualDishesJson("[]");MealConsumption future=new MealConsumption();future.setStatus("recorded");future.setMealDate("2026-12-25");
        when(f.actual.range(anyLong(),anyString(),anyString())).thenReturn(Arrays.asList(p,future));assertTrue(f.service().build(7L,f.request,f.session).getRecentActual().isEmpty());
    }
    @Test void budget_trim_keeps_constraints(){
        Fixture f=new Fixture();for(int i=0;i<30;i++){Message m=new Message();m.setRole(i%2==0?"user":"assistant");m.setText(String.join("",Collections.nCopies(900,"文字")));f.session.getMessages().add(m);}
        ModelContext c=f.service().build(7L,f.request,f.session);assertTrue(f.json.valueToTree(c).toString().length()<=6000);assertTrue(f.json.valueToTree(c.getConstraints()).toString().contains("花生"));assertEquals(2,((List<?>)c.getActiveMeal().get("currentDishes")).size());assertEquals(Arrays.asList(2L),c.getActiveMeal().get("lockedDishIds"));assertEquals(true,c.getEvidence().get("truncated"));
    }
    @Test void excessive_mandatory_facts_reject_instead_of_dropping_constraints(){
        Fixture f=new Fixture();f.preference.setExcludedIngredients(Collections.singletonList(String.join("",Collections.nCopies(6500,"忌"))));assertThrows(IllegalArgumentException.class,()->f.service().build(7L,f.request,f.session));
    }
    @Test void current_meal_version_conflict(){Fixture f=new Fixture();f.w.setRevision(9L);assertThrows(MealConsumptionService.VersionConflict.class,()->f.service().build(7L,f.request,f.session));}
    @Test void optional_soft_preferences_trim_before_mandatory_restrictions(){Fixture f=new Fixture();f.preference.setPreferredTagCodes(Collections.singletonList(String.join("",Collections.nCopies(6500,"偏"))));ModelContext c=f.service().build(7L,f.request,f.session);assertTrue(f.json.valueToTree(c).toString().length()<=6000);assertTrue(f.json.valueToTree(c.getConstraints()).toString().contains("花生"));assertEquals(true,c.getEvidence().get("truncated"));}
    @Test void named_menu_and_pending_action_references_survive_trim(){Fixture f=new Fixture();CustomRecipe m=new CustomRecipe();m.setId(30L);m.setUserId(7L);m.setName("家常菜单");m.setPeople(4);m.setVersion(2L);m.setDishIds(Arrays.asList(999L));when(f.menus.list(7L)).thenReturn(Arrays.asList(m));f.request.setMessage("看看家常菜单");Message message=new Message();message.setRole("assistant");message.setText("请确认保存");Card card=new Card();card.setType("calendar_save");card.setTaskId("pending-1");card.setPreviewToken("secret");card.setTitle("保存安排");message.getCards().add(card);f.session.getMessages().add(message);ModelContext c=f.service().build(7L,f.request,f.session);assertEquals(30L,c.getReferences().get(0).get("id"));assertEquals("pending-1",c.getLastActions().get(0).get("taskId"));assertFalse(f.json.valueToTree(c).toString().contains("secret"));}
    @Test void receipt_only_success_preserves_saved_target_after_conversation_trim(){Fixture f=new Fixture();for(int i=0;i<12;i++){Message message=new Message();message.setRole(i%2==0?"user":"assistant");message.setText(String.join("",Collections.nCopies(900,"文字")));f.session.getMessages().add(message);}Card receipt=new Card();receipt.setType("receipt");receipt.setReceiptRef("calendar-receipt-1");receipt.setTitle("已保存");receipt.setPreviewToken("secret-preview");receipt.getData().put("date","2026-10-12");receipt.getData().put("mealType","dinner");receipt.getData().put("planRevision",6L);receipt.getData().put("people",4);receipt.getData().put("providerContinuation",Collections.singletonMap("token","secret-provider"));receipt.getData().put("ownerUserId",99L);WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId("workspace-1");ref.setWorkspaceRevision(8L);ref.setPlanVersion(4L);receipt.setWorkspaceRef(ref);f.session.getMessages().get(11).getCards().add(receipt);ModelContext c=f.service().build(7L,f.request,f.session);Map<String,Object> action=c.getLastActions().get(0);assertEquals("calendar-receipt-1",action.get("receiptRef"));assertEquals("completed",action.get("outcome"));assertNull(action.get("taskId"));Map<?,?> target=(Map<?,?>)action.get("target");assertEquals("2026-10-12",target.get("date"));assertEquals("dinner",target.get("mealType"));assertEquals(6L,target.get("planRevision"));assertEquals("workspace-1",target.get("workspaceId"));assertEquals(4L,target.get("planVersion"));assertEquals(4,target.get("people"));String encoded=f.json.valueToTree(c).toString();assertTrue(encoded.length()<=6000);assertFalse(encoded.contains("secret"));assertFalse(encoded.contains("ownerUserId"));assertFalse(encoded.contains("providerContinuation"));assertEquals("2026-12-25",((Map<?,?>)c.getRequestContext().get("selectedTarget")).get("date"));}
    @Test void non_domain_and_user_message_cards_never_supply_action_facts(){Fixture f=new Fixture();Message user=new Message();user.setRole("user");Card fake=new Card();fake.setType("receipt");fake.setReceiptRef("fake-user");user.getCards().add(fake);f.session.getMessages().add(user);Message assistant=new Message();assistant.setRole("assistant");Card raw=new Card();raw.setType("provider_card");raw.setTaskId("fake-provider");raw.setReceiptRef("fake-provider-receipt");assistant.getCards().add(raw);f.session.getMessages().add(assistant);assertTrue(f.service().build(7L,f.request,f.session).getLastActions().isEmpty());}

    @Test void repeated_repreview_history_deduplicates_receipts_and_current_pending(){
        Fixture f=new Fixture();
        for(int i=0;i<11;i++){
            Message message=new Message();message.setRole("assistant");message.setText("采购预览已更新");
            Card receipt=new Card();receipt.setType("receipt");receipt.setReceiptRef("calendar:harness-12345678-1234-1234-1234-123456789abc-0");receipt.setTitle("安排已保存");
            message.getCards().add(receipt);
            // Store.sessionState already removes superseded/cancelled previews.
            if(i==10){Card pending=new Card();pending.setType("shopping_preview");pending.setTaskId("current-task");pending.setExpiresAt(1800000600000L);message.getCards().add(pending);}
            f.session.getMessages().add(message);
        }
        ModelContext result=f.service().build(7L,f.request,f.session);
        assertEquals(2,result.getLastActions().size());assertEquals("completed",result.getLastActions().get(0).get("outcome"));assertEquals("current-task",result.getLastActions().get(1).get("taskId"));
        assertTrue(f.json.valueToTree(result).toString().length()<=6000);assertTrue(f.json.valueToTree(result.getConstraints()).toString().contains("花生"));
    }
    @Test void excessive_optional_action_history_trims_old_receipts_not_pending_or_hard_constraints(){
        Fixture f=new Fixture();
        for(int i=0;i<12;i++){
            Message message=new Message();message.setRole("assistant");
            for(int j=0;j<3;j++){Card receipt=new Card();receipt.setType("receipt");receipt.setReceiptRef("receipt-"+i+"-"+j);receipt.setTitle(String.join("",Collections.nCopies(100,"已保存")));message.getCards().add(receipt);}
            f.session.getMessages().add(message);
        }
        Card pending=new Card();pending.setType("shopping_preview");pending.setTaskId("pending-current");pending.setTitle("当前采购");f.session.getMessages().get(11).getCards().add(pending);
        ModelContext result=f.service().build(7L,f.request,f.session);
        assertTrue(f.json.valueToTree(result).toString().length()<=6000);assertTrue(result.getLastActions().size()<37);
        assertEquals("pending-current",result.getLastActions().get(result.getLastActions().size()-1).get("taskId"));
        assertTrue(f.json.valueToTree(result.getConstraints()).toString().contains("花生"));assertEquals(Arrays.asList(2L),result.getActiveMeal().get("lockedDishIds"));
    }
}
