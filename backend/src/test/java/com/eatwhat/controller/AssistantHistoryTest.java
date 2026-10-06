package com.eatwhat.controller;
import com.eatwhat.service.AssistantGateway;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Collections;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class AssistantHistoryTest {
 @Test void listUsesAuthenticatedOwnerAndRejectsGuests() {
  AssistantGateway gateway=mock(AssistantGateway.class);
  when(gateway.get(anyString())).thenReturn(AssistantGateway.GatewayResponse.of(org.springframework.http.HttpStatus.OK,Collections.singletonMap("sessions",Collections.emptyList())));
  AssistantController controller=new AssistantController(gateway);
  MockHttpServletRequest request=new MockHttpServletRequest();
  assertEquals(401,controller.listSessions(null,20,request).getStatusCodeValue());
  request.setAttribute("currentUserId",7L);request.setParameter("user_id","8");
  assertEquals(200,controller.listSessions("abc",20,request).getStatusCodeValue());
  verify(gateway).get("/assistant/sessions?user_id=7&limit=20&cursor=abc");
  assertEquals(400,controller.listSessions(null,51,request).getStatusCodeValue());
 }
}
