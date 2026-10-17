package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class AssistantReplyIntegrationTest {
 @Test void authenticated_keep_choice_completes_without_model_or_draft_write(){
  ModelContext context=new ModelContext();context.getActiveMeal().put("currentDishes",Collections.singletonList(AssistantV4ContextService.map("id",1L,"name","原菜单")));
  context.getRequestContext().put("clarification",AssistantV4ContextService.map("kind","meal_requirement","selection",AssistantV4ContextService.map("requirementMode","keep")));
  when(f.context.build(any(),any(),any())).thenReturn(context);
  java.util.concurrent.atomic.AtomicInteger writes=new java.util.concurrent.atomic.AtomicInteger();
  f.registry.registerDraft("draft_update",(u,step,scope)->{writes.incrementAndGet();TurnResult result=new TurnResult();result.setStatus("completed");Card card=new Card();card.setReceiptRef("unexpected-write");result.getCards().add(card);return result;});
  StepOutput out=output("可以换一道。");ActionProposal proposal=new ActionProposal();ActionIntent action=new ActionIntent();action.setKind("draft_update");action.setArguments(AssistantV4ContextService.map("operation","generate","selectedDishIds",Collections.singletonList(1L)));proposal.getSteps().add(action);out.setActionProposal(proposal);when(f.model.step(any())).thenReturn(out);
  f.runner.runTurn(1L,f.id);TurnView result=f.store.findTurn(1L,f.id);
  assertEquals(0,writes.get());verify(f.model,never()).step(any());assertEquals(0,f.store.turnRecord(1L,f.id).getProviderCallsUsed());
  assertEquals("completed",result.getStatus());assertNull(result.getPendingAction());assertNull(result.getContinuation());assertFalse(result.getCards().isEmpty());assertTrue(result.getCards().stream().allMatch(card->card.getReceiptRef()==null));
 }
 AssistantV4TurnServiceTest f;
 @BeforeEach void setup(){f=new AssistantV4TurnServiceTest();f.setup();when(f.model.supportsNaturalReplies()).thenReturn(true);}
 StepOutput output(String text){StepOutput out=new StepOutput();out.setType("final");AnswerDraft draft=new AnswerDraft();AnswerSegment segment=new AnswerSegment();segment.setText(text);segment.getEvidenceKeys().add("dish:1");draft.getSegments().add(segment);draft.getCardRefs().add("dish:1");out.setAnswer(draft);return out;}
 @Test void model_reply_and_actual_card_are_persisted_together_without_evidence_payload(){
  when(f.model.step(any())).thenAnswer(call->{StepInput input=call.getArgument(0);assertEquals("meal_reply.v1",input.getReplyContract());assertEquals("dish:1",input.getAnswerBasis().getItems().get(0).getKey());return output("可以先选这道，再看看另一道想吃什么。");});
  f.runner.runTurn(1L,f.id);TurnView result=f.store.findTurn(1L,f.id);assertEquals("completed",result.getStatus());assertEquals("可以先选这道，再看看另一道想吃什么。",result.getReply());assertFalse(result.getCards().isEmpty());
  assertFalse(f.store.turnRecord(1L,f.id).getResultJson().contains("answerBasis"));assertEquals(result.getReply(),f.store.findTurn(1L,f.id).getReply());
 }
 @Test void unsupported_or_unnegotiated_text_falls_back_and_keeps_cards(){for(boolean enabled:new boolean[]{false,true}){setup();when(f.model.supportsNaturalReplies()).thenReturn(enabled);when(f.model.step(any())).thenReturn(output("已保存到明天。"));f.runner.runTurn(1L,f.id);TurnView result=f.store.findTurn(1L,f.id);assertFalse(result.getReply().contains("已保存"));assertFalse(result.getCards().isEmpty());}}
 @Test void stale_draft_explanation_is_not_reused_after_menu_changed(){
  f.registry.registerDraft("draft_update",(u,step,scope)->{TurnResult result=new TurnResult();result.setStatus("completed");Card card=new Card();card.setType("menu");card.setReceiptRef("workspace:real");card.getData().put("dishes",Collections.singletonList(AssistantV4ContextService.map("id",2L,"name","新菜单")));result.getCards().add(card);return result;});
  StepOutput out=output("这道可以继续保留。");ActionIntent action=new ActionIntent();action.setKind("draft_update");action.setArguments(AssistantV4ContextService.map("operation","generate","selectedDishIds",Collections.singletonList(1L)));ActionProposal proposal=new ActionProposal();proposal.getSteps().add(action);out.setActionProposal(proposal);when(f.model.step(any())).thenReturn(out);
  f.runner.runTurn(1L,f.id);TurnView result=f.store.findTurn(1L,f.id);assertEquals("completed",result.getStatus());assertEquals("已更新本餐",result.getReply());assertEquals("workspace:real",result.getCards().get(0).getReceiptRef());
 }
}
