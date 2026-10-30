package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AssistantActionReplyFormatterTest {
    @Test void serverConfigurationAndMenuUndoReceiptsHaveDistinctSuccessDescriptions(){
        WorkflowContinuation config=workflow("draft_update",AssistantV4ContextService.map("operation","adjust","contextPatch",Collections.singletonMap("recommendationPreferences",Collections.emptyMap())));
        Card configured=receipt("real",AssistantV4ContextService.map("changeKind","configuration","dishes",Arrays.asList(dish(1),dish(2))));
        assertEquals("下次搭配条件已更新，当前菜品未变",AssistantActionReplyFormatter.completed(config,Collections.singletonList(configured),Collections.emptyMap()));
        WorkflowContinuation undo=workflow("draft_update",Collections.singletonMap("operation","undo"));Card restored=receipt("real",AssistantV4ContextService.map("changeKind","menu_undo","dishes",Arrays.asList(dish(1),dish(2)),"canUndo",false));
        assertEquals("已恢复上一版菜单",AssistantActionReplyFormatter.completed(undo,Collections.singletonList(restored),Collections.emptyMap()));
    }
    @Test void regeneration_without_a_proven_changed_menu_does_not_claim_a_new_set(){
        WorkflowContinuation c=workflow("draft_update",Collections.singletonMap("operation","regenerate"));
        Card actual=receipt("real",AssistantV4ContextService.map("mealType","dinner","dishes",Arrays.asList(dish(1),dish(2))));
        for(Map<String,Object> previous:Arrays.asList(Collections.<String,Object>emptyMap(),Collections.<String,Object>singletonMap("currentDishes",Arrays.asList(dish(1),dish(2)))))
            assertEquals("已安排好晚餐，共2道菜",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),previous));
        assertEquals("已换好一套晚餐，共2道菜",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),Collections.singletonMap("currentDishes",Arrays.asList(dish(3),dish(4)))));
    }
    @Test void requested_people_never_replace_actual_receipt_people_and_missing_snapshot_never_claims_unchanged(){
        WorkflowContinuation c=workflow("draft_update",AssistantV4ContextService.map("operation","adjust","contextPatch",Collections.singletonMap("people",9)));
        Card actual=receipt("real",AssistantV4ContextService.map("people",3,"dishes",Arrays.asList(dish(1),dish(2))));
        assertEquals("本餐现为3人分食，共2道菜",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),Collections.emptyMap()));
    }
    @Test void changed_other_dish_cannot_be_described_as_preserved(){
        WorkflowContinuation c=workflow("draft_update",AssistantV4ContextService.map("operation","adjust","targetDishId",1));
        Card actual=receipt("real",Collections.singletonMap("dishes",Arrays.asList(dish(3),dish(4))));
        assertEquals("已调整本餐菜单，共2道菜",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),Collections.singletonMap("currentDishes",Arrays.asList(dish(1),dish(2)))));
    }
    @Test void unchanged_result_never_claims_a_replacement(){
        WorkflowContinuation c=workflow("draft_update",AssistantV4ContextService.map("operation","adjust","targetDishId",1));
        Card actual=receipt("real",Collections.singletonMap("dishes",Arrays.asList(dish(1),dish(2))));
        assertEquals("已更新本餐，菜品未变",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),Collections.singletonMap("currentDishes",Arrays.asList(dish(1),dish(2)))));
    }
    @Test void calendar_target_is_from_matched_receipt_not_requested_target_or_unrelated_card(){
        WorkflowContinuation c=workflow("calendar_save",AssistantV4ContextService.map("targetDate","2026-11-01","targetMealType","lunch"));
        Card other=receipt("other",AssistantV4ContextService.map("date","2026-11-01","mealType","lunch"));
        Card actual=receipt("real",AssistantV4ContextService.map("date","2026-11-02","mealType","breakfast"));
        assertEquals("已保存到2026-11-02早餐",AssistantActionReplyFormatter.completed(c,Arrays.asList(actual,other),Collections.emptyMap()));
        assertEquals("已保存到日历",AssistantActionReplyFormatter.completed(c,Collections.singletonList(other),Collections.emptyMap()));
    }
    @Test void legacy_or_invalid_target_receipts_do_not_make_up_a_date(){
        WorkflowContinuation c=workflow("calendar_save",Collections.emptyMap());
        for(Map<String,Object> data:Arrays.asList(Collections.<String,Object>emptyMap(),AssistantV4ContextService.map("date","2026-02-30","mealType","dinner"),AssistantV4ContextService.map("date","2026-11-02","mealType","unknown")))
            assertEquals("已保存到日历",AssistantActionReplyFormatter.completed(c,Collections.singletonList(receipt("real",data)),Collections.emptyMap()));
    }
    @Test void awaiting_or_failed_step_never_claims_its_requested_save_succeeded(){
        WorkflowContinuation c=workflow("calendar_save",Collections.emptyMap());c.setCursor(0);c.getSteps().get(0).setStatus("awaiting_confirmation");
        assertEquals("正在准备下一步",AssistantActionReplyFormatter.completed(c,Collections.emptyList(),Collections.emptyMap()));
    }
    @Test void receipt_numbers_do_not_introduce_a_nutrition_claim_or_a_real_order(){
        WorkflowContinuation c=workflow("shopping_preview",Collections.emptyMap());Card actual=receipt("real",AssistantV4ContextService.map("energyKcal",0,"addedItemCount",0,"price",0));
        assertEquals("已加入采购清单",AssistantActionReplyFormatter.completed(c,Collections.singletonList(actual),Collections.emptyMap()));
    }
    private WorkflowContinuation workflow(String kind,Map<String,Object> arguments){ActionIntent action=new ActionIntent();action.setKind(kind);action.setArguments(arguments);WorkflowContinuation c=com.eatwhat.dto.AssistantV4Contract.workflow("turn",Collections.singletonList(action));c.getSteps().get(0).setStatus("completed");c.getSteps().get(0).setReceiptRef("real");c.setCursor(1);return c;}
    private Card receipt(String ref,Map<String,Object> data){Card card=new Card();card.setReceiptRef(ref);card.setData(data);return card;}
    private Map<String,Object> dish(int id){return AssistantV4ContextService.map("id",id,"type","veg");}
}
