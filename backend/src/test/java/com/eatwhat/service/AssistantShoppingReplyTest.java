package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.eatwhat.service.AssistantV4ContextService.map;

class AssistantShoppingReplyTest {
    private final AssistantFactReplyFormatter formatter=new AssistantFactReplyFormatter();
    private Map<String,Object> estimate(int covered,int missing,Long subtotal,boolean available){return map("scope","pending_source_items","coveredCount",covered,"missingCount",missing,"totalCount",covered+missing,"knownSubtotalCents",subtotal,"totalCents",covered>0&&missing==0?subtotal:null,"complete",covered>0&&missing==0,"serviceAvailable",available,"quoteDates",new ArrayList<>(covered>0?Arrays.asList("2026-10-28"):Collections.emptyList()));}
    private ReadResult read(Map<String,Object> estimate){ReadResult read=new ReadResult();read.setName("read_shopping");read.setCallId("price");read.getItems().add(map("id",1,"name","盐","checked",false));read.setPriceEstimate(estimate);return read;}
    private ToolRead call(boolean prices){ToolRead call=new ToolRead();call.setName("read_shopping");call.setCallId("price");call.getArguments().put("includePrices",prices);return call;}
    private AssistantFactReplyFormatter.AuthorizedReadFact fact(Map<String,Object> estimate){return AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read(estimate),call(true));}
    private String text(AssistantFactReplyFormatter.AuthorizedReadFact... facts){return formatter.format(Arrays.asList(facts),new ModelContext());}

    @Test void partialEstimateShowsWholePendingCoverageKnownSubtotalAndRealDate(){String text=text(fact(estimate(1,1,360L,true)));assertTrue(text.contains("覆盖1/2项"),text);assertTrue(text.contains("已知小计3.60元"),text);assertTrue(text.contains("不能作为整单总价"),text);assertTrue(text.contains("2026-10-28"),text);assertFalse(text.contains("参考总计"),text);}
    @Test void completeEstimateCanShowReferenceTotalIncludingAnActuallyRoundedZero(){for(long cents:new long[]{720,0}){String text=text(fact(estimate(2,0,cents,true)));assertTrue(text.contains("覆盖2/2项"),text);assertTrue(text.contains(cents==0?"参考总计0.00元":"参考总计7.20元"),text);assertFalse(text.contains("实付"));assertFalse(text.contains("已下单"));}}
    @Test void resultAndRequestMutationsCannotChangeTheAuthorizedEstimateSnapshot(){Map<String,Object> estimate=estimate(1,1,360L,true);ReadResult read=read(estimate);ToolRead call=call(true);AssistantFactReplyFormatter.AuthorizedReadFact fact=AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read,call);estimate.put("knownSubtotalCents",99999L);((List<String>)estimate.get("quoteDates")).set(0,"2099-01-01");call.getArguments().clear();String text=text(fact);assertTrue(text.contains("3.60元"),text);assertTrue(text.contains("2026-10-28"),text);assertFalse(text.contains("999.99"));assertFalse(text.contains("2099"));}
    @Test void latestRequestedUnavailableOrUnknownEstimateCannotBorrowOlderPrice(){for(Map<String,Object> missing:Arrays.asList(estimate(0,2,null,false),null)){String text=text(fact(estimate(2,0,720L,true)),fact(missing));assertTrue(text.contains("参考价暂"),text);assertFalse(text.contains("7.20"),text);assertFalse(text.contains("0.00元"),text);}}
    @Test void optOutReadCannotCreateAnEstimateAndEmptyPendingListIsNotZeroCost(){assertFalse(text(AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read(estimate(2,0,720L,true)),call(false))).contains("元"));String text=text(fact(estimate(0,0,null,true)));assertTrue(text.contains("没有待买项目"),text);assertFalse(text.contains("0.00元"));}
    @Test void partialMaterialPagingDoesNotDowngradeTheAuthoritativeWholePendingCoverage(){ReadResult read=read(estimate(35,0,12600L,true));read.setTruncated(true);read.setNextCursor("1");String text=text(AssistantFactReplyFormatter.AuthorizedReadFact.fromRead(read,call(true)));assertTrue(text.contains("部分结果"),text);assertTrue(text.contains("覆盖35/35项"),text);assertTrue(text.contains("参考总计126.00元"),text);}

    @Test void acceptedNaturalReplyRetainsAuthoritativePartialPriceAndRejectsModelPriceGuess() throws Exception {
        for(String explanation:Arrays.asList("可以先看看需要买哪些食材。","整单参考价是0元。")){
            AssistantV4TurnServiceTest f=new AssistantV4TurnServiceTest();f.setup();when(f.model.supportsNaturalReplies()).thenReturn(true);
            f.registry.registerRead("read_shopping",(u,c,s)->{ReadResult read=read(estimate(1,1,360L,true));read.setCallId(c.getCallId());return read;});
            when(f.model.step(any())).thenAnswer(invocation->{if(f.store.turnRecord(1L,f.id).getProviderCallsUsed()>1){StepOutput out=f.finalOutput();AnswerDraft answer=new AnswerDraft();AnswerSegment segment=new AnswerSegment();segment.setText(explanation);answer.getSegments().add(segment);out.setAnswer(answer);return out;}StepOutput out=f.tools(invocation.getArgument(0),"price");out.getReadCalls().get(0).setName("read_shopping");out.getReadCalls().get(0).getArguments().put("includePrices",true);Map<String,Object> function=(Map<String,Object>)((Map<?,?>)((List<?>)out.getProviderContinuation().getAssistantMessage().get("tool_calls")).get(0)).get("function");function.put("name","read_shopping");function.put("arguments","{\"includePrices\":true}");return out;});
            f.runner.runTurn(1L,f.id);TurnView view=f.store.findTurn(1L,f.id);assertEquals("completed",view.getStatus());assertTrue(view.getReply().contains("已知小计3.60元"),view.getReply());assertTrue(view.getReply().contains("覆盖1/2项"),view.getReply());assertFalse(view.getReply().contains("整单参考价是0元"));if(explanation.startsWith("可以"))assertTrue(view.getReply().startsWith(explanation),view.getReply());
        }
    }
}
