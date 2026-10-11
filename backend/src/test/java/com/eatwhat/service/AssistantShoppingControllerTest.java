package com.eatwhat.service;

import com.eatwhat.controller.AssistantShoppingController;
import com.eatwhat.dto.ControlledToolTask;
import com.eatwhat.dto.AssistantShoppingContract.RepreviewRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantShoppingControllerTest {
 @Test void optional_selection_fields_and_request_id_reach_only_authenticated_adapter(){
  ShoppingAssistantToolAdapter adapter=mock(ShoppingAssistantToolAdapter.class);AssistantCapabilityService caps=mock(AssistantCapabilityService.class);
  AssistantShoppingController controller=new AssistantShoppingController(adapter,caps,new ObjectMapper());MockHttpServletRequest request=new MockHttpServletRequest();request.setAttribute("currentUserId",1L);ControlledToolTask renewed=new ControlledToolTask();when(adapter.repreview(eq(1L),eq("original"),any())).thenReturn(renewed);
  assertSame(renewed,controller.repreview("original",Collections.singletonMap("requestId","renewal"),request));verify(adapter).repreview(eq(1L),eq("original"),argThat(r->"renewal".equals(r.getRequestId())&&r.getSelectedSourceKeys()==null));
 }
 @Test void anonymous_and_arbitrary_quantity_payloads_never_reach_adapter(){
  ShoppingAssistantToolAdapter adapter=mock(ShoppingAssistantToolAdapter.class);AssistantShoppingController controller=new AssistantShoppingController(adapter,mock(AssistantCapabilityService.class),new ObjectMapper());MockHttpServletRequest request=new MockHttpServletRequest();Map<String,Object> body=new HashMap<>();body.put("requestId","renewal");
  assertEquals(401,assertThrows(ResponseStatusException.class,()->controller.repreview("task",body,request)).getRawStatusCode());request.setAttribute("currentUserId",1L);body.put("quantity",999);assertThrows(IllegalArgumentException.class,()->controller.repreview("task",body,request));verifyNoInteractions(adapter);
 }
}
