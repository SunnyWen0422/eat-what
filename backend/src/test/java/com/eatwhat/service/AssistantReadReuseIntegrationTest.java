package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class AssistantReadReuseIntegrationTest {
 @Test void repeated_versioned_read_reuses_result_but_preserves_new_call_id_and_turn_budget(){
  AssistantV4TurnServiceTest f=new AssistantV4TurnServiceTest();f.setup();AtomicInteger reads=new AtomicInteger(),models=new AtomicInteger();
  AssistantCapabilityService registry=new AssistantCapabilityService(true);registry.registerRead("search_dishes",(u,call,scope)->{reads.incrementAndGet();ReadResult value=f.read(call);value.setSourceVersion("v1");return value;});registry.registerReadVersion("search_dishes",(u,scope)->"v1");
  AssistantV4TurnService runner=new AssistantV4TurnService(f.store,f.context,registry,f.model,f.protection,f.dishes,f.json,Clock.fixed(Instant.ofEpochMilli(f.fixture.now),ZoneOffset.UTC),Runnable::run);
  when(f.model.step(any())).thenAnswer(call->{StepInput in=call.getArgument(0);int n=models.incrementAndGet();if(n==3){assertEquals("c2",in.getReadResults().get(0).getCallId());return f.finalOutput();}return f.tools(in,"c"+n);});
  runner.runTurn(1L,f.id);assertEquals("completed",f.store.findTurn(1L,f.id).getStatus());assertEquals(1,reads.get());assertEquals(3,f.store.turnRecord(1L,f.id).getProviderCallsUsed());
 }
}
