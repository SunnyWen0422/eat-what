package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** In-memory mappers/store and mocked provider only; no Spring context or datasource. */
class ExperienceStageInstrumentationTest {
    @Test void instrumentation_failures_cannot_fail_a_valid_response() {
        io.micrometer.core.instrument.MeterRegistry broken=mock(io.micrometer.core.instrument.MeterRegistry.class);
        when(broken.timer(anyString(),any(String[].class))).thenThrow(new IllegalStateException("registry unavailable"));
        assertDoesNotThrow(()->new ExperienceMetrics(broken).recordStage("candidate_scan","success",1,2));
    }
    @Test void metrics_labels_cannot_contain_private_values() {
        SimpleMeterRegistry registry=new SimpleMeterRegistry();ExperienceMetrics metrics=new ExperienceMetrics(registry);
        for(String old:Arrays.asList("failed","rejected","cancelled","degraded","unknown","busy"))metrics.recordStage("request",old,1,1);
        for(String outcome:Arrays.asList("success","error","timeout","cancel","recover"))metrics.recordStage("task_execution",outcome,1,1);
        assertThrows(IllegalArgumentException.class,()->metrics.recordStage("prompt-private","success",1,1));
        assertThrows(IllegalArgumentException.class,()->metrics.recordStage("request","userId-private",1,1));
        registry.getMeters().forEach(m->assertTrue(Arrays.asList("success","error","timeout","cancel","recover").contains(m.getId().getTag("outcome"))));
    }
    @Test void real_candidate_scan_and_details_record_actual_rows_and_fail_open() {
        DishMapper mapper=mock(DishMapper.class);Dish d=new Dish();d.setId(1L);d.setName("private dish");
        when(mapper.selectRecommendationCandidateFacts(any(),any(),any(),anyList(),anyList(),any(),any(),eq(256))).thenReturn(Collections.singletonList(d));
        when(mapper.selectFilteredPageDetails(anyList(),any())).thenReturn(Collections.singletonList(d));
        DishCandidateQueryService service=new DishCandidateQueryService(mapper);SimpleMeterRegistry registry=new SimpleMeterRegistry();
        ReflectionTestUtils.setField(service,"metrics",new ExperienceMetrics(registry));
        assertEquals(1,service.findForUser(1L,null,null,null,10).size());
        for(String stage:Arrays.asList("candidate_scan","candidate_details")){
            assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage",stage).timer().count());
            assertEquals(1,registry.get("eatwhat.experience.items").tag("stage",stage).summary().totalAmount());
        }
        ExperienceMetrics broken=mock(ExperienceMetrics.class);doThrow(new IllegalStateException("broken sink")).when(broken).recordStage(anyString(),anyString(),anyLong(),anyLong());
        ReflectionTestUtils.setField(service,"metrics",broken);assertEquals(1,service.findForUser(1L,null,null,null,10).size());
    }
    @Test void queue_delay_is_separate_from_execution_duration() {
        AssistantV4TurnServiceTest f=new AssistantV4TurnServiceTest();f.setup();AtomicLong now=new AtomicLong(f.fixture.now+800);
        Clock clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return this;}public Instant instant(){return Instant.ofEpochMilli(now.get());}};
        List<Runnable> queued=new ArrayList<>();SimpleMeterRegistry registry=new SimpleMeterRegistry();
        AssistantV4TurnService runner=new AssistantV4TurnService(f.store,f.context,new AssistantCapabilityService(true),f.model,f.protection,f.dishes,f.json,clock,queued::add);
        ReflectionTestUtils.setField(runner,"metrics",new ExperienceMetrics(registry));
        when(f.model.step(any())).thenAnswer(i->{now.addAndGet(200);return f.finalOutput();});
        runner.enqueue(1L,f.id);runner.enqueue(1L,f.id);assertEquals(1,queued.size());queued.get(0).run();runner.runTurn(1L,f.id);
        assertEquals("completed",f.store.findTurn(1L,f.id).getStatus());
        assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","assistant_queue").timer().count());
        assertEquals(800,registry.get("eatwhat.experience.duration").tag("stage","assistant_queue").timer().totalTime(java.util.concurrent.TimeUnit.MILLISECONDS));
        assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","task_execution").timer().count());
        assertEquals(200,registry.get("eatwhat.experience.duration").tag("stage","task_execution").timer().totalTime(java.util.concurrent.TimeUnit.MILLISECONDS));
    }
    @org.junit.jupiter.params.ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings={"queued","running"})
    void workspace_queue_uses_durable_created_time_and_records_once_after_claim(String status) throws Exception {
        com.eatwhat.mapper.MealWorkspaceMapper db=mock(com.eatwhat.mapper.MealWorkspaceMapper.class);
        MealWorkspaceService service=mock(MealWorkspaceService.class);MealWorkspacePlanner planner=mock(MealWorkspacePlanner.class);
        AtomicLong now=new AtomicLong(1800000000000L);Clock clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId z){return this;}public Instant instant(){return Instant.ofEpochMilli(now.get());}};
        com.fasterxml.jackson.databind.ObjectMapper json=new com.fasterxml.jackson.databind.ObjectMapper();MealWorkspace w=new MealWorkspace();WorkspaceRequest r=new WorkspaceRequest();r.setCommand("select");
        com.eatwhat.entity.WorkspaceTask task=new com.eatwhat.entity.WorkspaceTask();task.setId("durable");task.setUserId(1L);task.setStatus(status);task.setCreatedAt(new Date(now.get()-600));
        Map<String,Object> input=new HashMap<>();input.put("workspace",w);input.put("request",r);task.setInputJson(json.writeValueAsString(input));
        when(db.claim(eq(task.getId()),anyString())).thenReturn(1,0);
        when(planner.generate(anyLong(),any(),anyString(),any(),any())).thenAnswer(i->{now.addAndGet(150);return new PlanDraft();});
        SimpleMeterRegistry registry=new SimpleMeterRegistry();MealWorkspaceTaskRunner runner=new MealWorkspaceTaskRunner(db,service,planner,mock(MealWorkspaceAgentGateway.class),json,true);
        ReflectionTestUtils.setField(runner,"clock",clock);ReflectionTestUtils.setField(runner,"metrics",new ExperienceMetrics(registry));
        try{runner.execute(task);runner.execute(task);}finally{runner.close();}
        if("queued".equals(status)){
        assertEquals(600,registry.get("eatwhat.experience.duration").tag("stage","assistant_queue").timer().totalTime(java.util.concurrent.TimeUnit.MILLISECONDS));
        assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","assistant_queue").timer().count());
        }else{assertNull(registry.find("eatwhat.experience.duration").tag("stage","assistant_queue").timer());assertNotNull(registry.get("eatwhat.experience.duration").tag("stage","task_execution").tag("outcome","recover").timer());}
        assertEquals(150,registry.get("eatwhat.experience.duration").tag("stage","task_execution").timer().totalTime(java.util.concurrent.TimeUnit.MILLISECONDS));
        assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","task_execution").timer().count());
        verify(service).finish(eq(task),any(),any(),anyString(),eq("draft"));
    }
    @Test void cancelled_v4_attempt_records_cancel_and_releases_protection_once() {
        AssistantV4TurnServiceTest f=new AssistantV4TurnServiceTest();f.setup();SimpleMeterRegistry registry=new SimpleMeterRegistry();
        ReflectionTestUtils.setField(f.runner,"metrics",new ExperienceMetrics(registry));
        when(f.model.step(any())).thenAnswer(i->{f.store.cancelTurn(1L,f.id);return f.finalOutput();});
        f.runner.runTurn(1L,f.id);f.runner.runTurn(1L,f.id);assertEquals("cancelled",f.store.findTurn(1L,f.id).getStatus());
        assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","task_execution").tag("outcome","cancel").timer().count());verify(f.protection,times(1)).release();
    }
    @Test void queue_and_execution_sink_failure_keeps_real_v4_response_and_releases_worker() {
        AssistantV4TurnServiceTest f=new AssistantV4TurnServiceTest();f.setup();ExperienceMetrics broken=mock(ExperienceMetrics.class);
        doThrow(new IllegalStateException("sink")).when(broken).recordStage(anyString(),anyString(),anyLong(),anyLong());
        ReflectionTestUtils.setField(f.runner,"metrics",broken);when(f.model.step(any())).thenReturn(f.finalOutput());
        assertDoesNotThrow(()->f.runner.runTurn(1L,f.id));assertEquals("completed",f.store.findTurn(1L,f.id).getStatus());verify(f.protection).release();
    }
    @Test void shopping_confirmation_sink_failure_keeps_saved_items_and_receipt() throws Exception {
        AssistantShoppingFixture f=new AssistantShoppingFixture();ExperienceMetrics broken=mock(ExperienceMetrics.class);
        doThrow(new IllegalStateException("sink")).when(broken).recordStage(anyString(),anyString(),anyLong(),anyLong());ReflectionTestUtils.setField(f.adapter,"metrics",broken);
        ControlledToolTask task=f.preview();ControlledToolTask done=f.confirm(task);assertEquals("completed",done.status);assertFalse(f.items.isEmpty());assertNotNull(done.steps.get(0).result.get("receiptRef"));assertEquals("completed",f.confirm(task).status);
    }
    @Test void gateway_nested_transport_timeout_uses_fixed_timeout_label_without_retry() {
        org.springframework.web.client.RestTemplate transport=mock(org.springframework.web.client.RestTemplate.class);
        when(transport.postForObject(anyString(),any(),eq(String.class))).thenThrow(new org.springframework.web.client.ResourceAccessException("private body",new java.net.SocketTimeoutException("private timeout")));
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("https://fixture.invalid","synthetic",new com.fasterxml.jackson.databind.ObjectMapper(),m->transport);SimpleMeterRegistry registry=new SimpleMeterRegistry();ReflectionTestUtils.setField(gateway,"metrics",new ExperienceMetrics(registry));StepInput input=new StepInput();input.setTimeoutSeconds(4);
        try{assertThrows(IllegalStateException.class,()->gateway.step(input));assertEquals(1,registry.get("eatwhat.experience.duration").tag("stage","model_http").tag("outcome","timeout").timer().count());verify(transport,times(1)).postForObject(anyString(),any(),eq(String.class));}finally{gateway.close();}
    }
    @Test void actual_workspace_confirmation_preserves_receipt_when_metrics_throw() throws Exception {
        WorkspaceTargetSaveTest.Fixture f=new WorkspaceTargetSaveTest.Fixture();ExperienceMetrics broken=mock(ExperienceMetrics.class);
        doThrow(new IllegalStateException("sink")).when(broken).recordStage(anyString(),anyString(),anyLong(),anyLong());
        ReflectionTestUtils.setField(f.service,"metrics",broken);
        MealWorkspace saved=f.save(f.request("2027-01-01","lunch"));assertEquals("planned",saved.getStatus());assertEquals(1,f.commits);
        assertEquals(f.json.writeValueAsString(saved.getConfirmation()),f.json.writeValueAsString(f.save(f.request("2027-01-01","lunch")).getConfirmation()));
        verify(f.plans,times(1)).insert(any());assertEquals(1,f.receipts.size());
    }
    @Test void current_v4_calendar_and_shopping_confirmations_are_observed_after_domain_calls() throws Exception {
        AssistantShoppingFixture f=new AssistantShoppingFixture();SimpleMeterRegistry registry=new SimpleMeterRegistry();ExperienceMetrics metrics=new ExperienceMetrics(registry);
        ReflectionTestUtils.setField(f.f.domain.service,"metrics",metrics);ReflectionTestUtils.setField(f.adapter,"metrics",metrics);
        ControlledToolTask calendar=f.calendar("2027-01-01","lunch");assertEquals("completed",f.confirm(calendar).status);
        ControlledToolTask shopping=f.preview();assertEquals("completed",f.confirm(shopping).status);
        assertEquals(2,registry.get("eatwhat.experience.duration").tag("stage","confirmation").tag("outcome","success").timer().count());
        assertFalse(f.items.isEmpty());assertFalse(f.f.domain.slots.isEmpty());
        f.confirm(shopping);assertEquals(2,registry.get("eatwhat.experience.duration").tag("stage","confirmation").timer().count());
    }
    @Test void gateway_whole_call_is_observed_and_sink_failure_preserves_output() {
        org.springframework.web.client.RestTemplate transport=mock(org.springframework.web.client.RestTemplate.class);
        when(transport.postForObject(anyString(),any(),eq(String.class))).thenReturn("{\"type\":\"need_input\",\"question\":\"safe\"}");
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("https://fixture.invalid","synthetic",new com.fasterxml.jackson.databind.ObjectMapper(),m->transport);
        ExperienceMetrics metrics=mock(ExperienceMetrics.class);ReflectionTestUtils.setField(gateway,"metrics",metrics);StepInput input=new StepInput();input.setTimeoutSeconds(3.5);
        try{assertEquals("need_input",gateway.step(input).getType());verify(metrics).recordStage(eq("model_http"),eq("success"),anyLong(),eq(1L));
            doThrow(new IllegalStateException("sink")).when(metrics).recordStage(anyString(),anyString(),anyLong(),anyLong());input.setDeadlineEpochMillis(null);assertEquals("need_input",gateway.step(input).getType());
        }finally{gateway.close();}
    }
}
