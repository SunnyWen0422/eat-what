package com.eatwhat.controller;

import com.eatwhat.service.AiProtectionProperties;
import com.eatwhat.service.AiProtectionService;
import com.eatwhat.service.ChatApplicationService;
import com.eatwhat.service.RequestRateLimiter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatControllerTest {

    @Test
    void syncChatReturnsRateLimitFeedbackWithoutCallingAi() {
        ChatApplicationService applicationService = mock(ChatApplicationService.class);
        AiProtectionService protection = new AiProtectionService(
                new AiProtectionProperties(1, 1, 1, 1024, 60_000L),
                new RequestRateLimiter(1, 60_000L,
                        Clock.fixed(Instant.parse("2026-07-28T00:00:00Z"), ZoneOffset.UTC)));
        ChatController controller = new ChatController(applicationService, protection, new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/chat/sync");
        request.setRemoteAddr("127.0.0.1");

        ResponseEntity<?> first = controller.chatSync(Collections.singletonMap("message", "hello"), request);
        ResponseEntity<?> second = controller.chatSync(Collections.singletonMap("message", "again"), request);

        assertEquals(200, first.getStatusCodeValue());
        assertEquals(429, second.getStatusCodeValue());
        assertTrue(String.valueOf(second.getBody()).contains("AI_RATE_LIMITED"));
        verify(applicationService).chatSync(Collections.singletonMap("message", "hello"), null);
    }

    @Test
    void oversizedSyncChatIsRejectedBeforeProxying() {
        ChatApplicationService applicationService = mock(ChatApplicationService.class);
        AiProtectionService protection = new AiProtectionService(
                new AiProtectionProperties(5, 5, 1, 10, 60_000L));
        ChatController controller = new ChatController(applicationService, protection, new ObjectMapper());
        Map<String, Object> body = Collections.singletonMap("message", "this is too long");

        ResponseEntity<?> response = controller.chatSync(body, new MockHttpServletRequest("POST", "/chat/sync"));

        assertEquals(413, response.getStatusCodeValue());
        assertTrue(String.valueOf(response.getBody()).contains("AI_BODY_TOO_LARGE"));
    }
}
