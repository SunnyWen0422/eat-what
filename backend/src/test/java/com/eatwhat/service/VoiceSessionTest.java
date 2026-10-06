package com.eatwhat.service;

import com.eatwhat.controller.VoiceController;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class VoiceSessionTest {
    @Test void signatureMatchesIndependentHmacSha1Vector() {
        String unsigned = "asr.cloud.tencent.com/asr/v2/1234567890?engine_model_type=16k_zh&expired=1700000060&nonce=123&secretid=testSecretId&timestamp=1700000000&voice_format=8&voice_id=test-voice";
        assertEquals("izbuxuEMjS3QFKyhvXeHACB5lvE%3D", VoiceSessionService.signature(unsigned, "testOnlyKey"));
    }
    private VoiceSessionService service() { return new VoiceSessionService(true, "1234567890", "testSecretId", "testOnlyKey"); }
    @Test void credentialsRemainServerSideAndSessionsAreFresh() {
        VoiceSessionService service = service();
        Map<String,Object> first = service.issue(1L), second = service.issue(1L);
        String url = (String) first.get("url");
        assertTrue(url.startsWith("wss://asr.cloud.tencent.com/asr/v2/1234567890?engine_model_type=16k_zh&expired="));
        assertTrue(url.contains("voice_format=8"));
        assertFalse(first.toString().contains("testOnlyKey"));
        assertFalse(first.containsKey("secretKey"));
        assertNotEquals(first.get("voiceId"), second.get("voiceId"));
        String unsigned = url.substring(6, url.indexOf("&signature="));
        assertEquals(VoiceSessionService.signature(unsigned, "testOnlyKey"), url.substring(url.indexOf("&signature=") + 11));
        assertTrue((Long) first.get("expiresAt") - System.currentTimeMillis() <= 60000);
        assertEquals(30000, first.get("maxDurationMs"));
    }
    @Test void anonymousDisabledAndExcessiveRequestsFailClosed() {
        assertEquals(401, assertThrows(VoiceSessionService.VoiceException.class, () -> service().issue(null)).status);
        assertEquals(503, assertThrows(VoiceSessionService.VoiceException.class,
            () -> new VoiceSessionService(false, "", "", "").issue(1L)).status);
        VoiceSessionService service = service();
        for (int i = 0; i < 6; i++) service.issue(1L);
        assertEquals(429, assertThrows(VoiceSessionService.VoiceException.class, () -> service.issue(1L)).status);
        assertNotNull(service.issue(2L));
    }
    @Test void controllerDoesNotCacheBearerUrlsOrExposeCredentialErrors() {
        MockHttpServletRequest request = new MockHttpServletRequest(); request.setAttribute("currentUserId", 1L);
        assertEquals("no-store", new VoiceController(service()).session(request).getHeaders().getFirst("Cache-Control"));
        org.springframework.http.ResponseEntity<?> response = new VoiceController(new VoiceSessionService(false,"","", "sensitive")).session(request);
        assertEquals(503, response.getStatusCodeValue());
        assertFalse(response.getBody().toString().contains("sensitive"));
        assertTrue(response.getBody().toString().contains("diagnostic_id"));
    }
}
