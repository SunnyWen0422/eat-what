package com.eatwhat.service;

import com.eatwhat.controller.ChatController;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class LegacyChatBusyContractTest {
    private ResponseEntity<?> request(String upstreamBody) {
        AiChatGateway gateway = new AiChatGateway("http://fixture.invalid", new ObjectMapper());
        RestTemplate rest = (RestTemplate) ReflectionTestUtils.getField(gateway, "restTemplate");
        MockRestServiceServer server = MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("http://fixture.invalid/chat/sync"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).contentType(MediaType.APPLICATION_JSON).body(upstreamBody));
        AiProtectionService protection = mock(AiProtectionService.class);
        when(protection.acquire(any(), anyString(), anyInt())).thenReturn(AiProtectionService.Decision.allowed());
        ChatController controller = new ChatController(new ChatApplicationService(gateway, mock(CustomDishService.class)), protection, new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest(); request.setAttribute("currentUserId", 7L);
        ResponseEntity<?> response = controller.chatSync(Collections.singletonMap("message", "fixture"), request);
        server.verify(); verify(protection).release(); return response;
    }

    @Test void busyCodeSurvivesJavaProxyWithSafeMessageAndRetryHint() {
        ResponseEntity<?> response = request("{\"errorCode\":\"AI_CHAT_BUSY\",\"message\":\"untrusted upstream text\"}");
        assertEquals(503, response.getStatusCodeValue());
        Map<?,?> body = (Map<?,?>)response.getBody();
        assertEquals(false,body.get("success")); assertEquals("AI_CHAT_BUSY",body.get("errorCode"));
        assertEquals("聊天服务忙，请稍后重试",body.get("message")); assertEquals("2",response.getHeaders().getFirst("Retry-After"));
    }

    @Test void unrelatedOrMalformedFailuresAreNotMisreportedAsBusy() {
        for(String upstream : Arrays.asList("{\"errorCode\":\"OTHER\",\"message\":\"secret diagnostic\"}", "private diagnostic")) {
            ResponseEntity<?> response = request(upstream); Map<?,?> body = (Map<?,?>)response.getBody();
            assertEquals(503,response.getStatusCodeValue()); assertEquals("AI_CHAT_UNAVAILABLE",body.get("errorCode"));
            assertEquals("暂时无法连接助手，请稍后重试",body.get("message"));
        }
    }
}
