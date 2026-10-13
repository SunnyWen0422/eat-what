package com.eatwhat;

import com.eatwhat.dto.AssistantV4Contract;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.service.AssistantCapabilityService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AssistantV4ContractTest {
    private final ObjectMapper json = new ObjectMapper();
    @Test void fact_source_is_internal_optional_step_metadata() throws Exception {
        StepOutput read=json.readValue("{\"type\":\"final\",\"reply\":\"safe\",\"factSource\":\"recent_actual\"}",StepOutput.class);
        assertEquals("recent_actual",read.getFactSource());assertNull(read.getActionProposal());
        StepOutput legacy=json.readValue("{\"type\":\"final\",\"reply\":\"safe\"}",StepOutput.class);
        assertNull(legacy.getFactSource());
        String turn="{\"requestId\":\"00000000-0000-4000-8000-000000000001\",\"message\":\"最近实际吃了什么\",\"workspaceId\":\"w\",\"expectedWorkspaceRevision\":0,\"expectedPlanVersion\":0,\"entryScene\":\"chat\"}";
        assertDoesNotThrow(()->AssistantV4Contract.parseTurn(json.readTree(turn)));
        String forged=turn.substring(0,turn.length()-1)+",\"factSource\":\"recent_actual\"}";
        assertThrows(IllegalArgumentException.class,()->AssistantV4Contract.parseTurn(json.readTree(forged)));
    }
    @Test void client_user_id_rejected() {
        assertThrows(Exception.class, () -> AssistantV4Contract.parseTurn(json.readTree("{\"userId\":7}")));
    }
    @Test void strict_types_and_nested_context_rejected() {
        String base="{\"requestId\":\"00000000-0000-4000-8000-000000000001\",\"message\":\"明晚\",\"workspaceId\":\"w\",\"expectedWorkspaceRevision\":0,\"expectedPlanVersion\":0,\"entryScene\":\"chat\"}";
        assertDoesNotThrow(() -> AssistantV4Contract.parseTurn(json.readTree(base)));
        assertThrows(Exception.class, () -> AssistantV4Contract.parseTurn(json.readTree(base.replace("\"expectedPlanVersion\":0","\"expectedPlanVersion\":true"))));
        assertThrows(Exception.class, () -> AssistantV4Contract.parseTurn(json.readTree(base.replace("\"entryScene\":\"chat\"","\"modelContext\":{}"))));
    }
    @Test void continuation_request_ids_are_stable_uuids() {
        ActionIntent a=new ActionIntent(); a.setKind("calendar_save");
        WorkflowContinuation one=AssistantV4Contract.workflow("turn",Collections.singletonList(a));
        WorkflowContinuation two=AssistantV4Contract.workflow("turn",Collections.singletonList(a));
        assertEquals(one.getSteps().get(0).getRequestId(),two.getSteps().get(0).getRequestId());
        assertDoesNotThrow(() -> UUID.fromString(one.getSteps().get(0).getRequestId()));
        assertThrows(IllegalArgumentException.class,()->AssistantV4Contract.workflow("t",Arrays.asList(a,a,a,a)));
    }
    @Test void public_projection_excludes_action_arguments_and_provider_reasoning() throws Exception {
        ActionIntent a=new ActionIntent();a.setKind("calendar_save");a.getArguments().put("privatePayload","secret");
        TurnView view=new TurnView();view.setContinuation(AssistantV4Contract.publicWorkflow(AssistantV4Contract.workflow("t",Collections.singletonList(a))));
        String output=json.writeValueAsString(view);
        assertFalse(output.contains("privatePayload"));assertFalse(output.contains("assistantMessage"));
        ProviderContinuation transientFrames=new ProviderContinuation();Map<String,Object> frame=new HashMap<>();frame.put("reasoning_content","internal-only");transientFrames.getMessages().add(frame);
        assertFalse(transientFrames.toString().contains("internal-only"));assertFalse(output.contains("reasoning_content"));
    }
    @Test void flag_alone_cannot_advertise_missing_execution() {
        AssistantCapabilityService service=new AssistantCapabilityService(true);
        assertFalse(service.capabilities().isEnabled());
        assertTrue(service.capabilities().getReads().isEmpty());
    }
    @Test void http_boundary_authenticates_and_rejects_forged_identity() throws Exception {
        com.eatwhat.service.AssistantV4Store store=mock(com.eatwhat.service.AssistantV4Store.class);
        AssistantCapabilityService cap=mock(AssistantCapabilityService.class);
        org.springframework.test.web.servlet.MockMvc mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new com.eatwhat.controller.AssistantV4Controller(store,cap)).setControllerAdvice(new com.eatwhat.exception.GlobalExceptionHandler()).build();
        mvc.perform(get("/assistant/v4/capabilities")).andExpect(status().isUnauthorized());
        mvc.perform(post("/assistant/v4/sessions/s/turns").requestAttr("currentUserId",1L).contentType("application/json").content("{\"userId\":2,\"message\":\"保存\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(store);
    }
    @Test void capabilities_are_only_the_registered_intersection() {
        AssistantCapabilityService cap=new AssistantCapabilityService(true);
        cap.registerTurnExecutor((u,t)->{});cap.registerRead("read_current_meal",(u,c,s)->new ReadResult());
        assertTrue(cap.capabilities().isEnabled());assertEquals(Collections.singletonList("read_current_meal"),cap.capabilities().getReads());assertTrue(cap.capabilities().getPreviewActions().isEmpty());
        assertThrows(IllegalArgumentException.class,()->cap.registerRead("unimplemented",(u,c,s)->new ReadResult()));
    }
}
