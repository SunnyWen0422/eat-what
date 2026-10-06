package com.eatwhat.controller;

import com.eatwhat.service.VoiceSessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
public class VoiceController {
    private static final Logger LOG = LoggerFactory.getLogger(VoiceController.class);
    private final VoiceSessionService service;
    public VoiceController(VoiceSessionService service) { this.service = service; }

    @PostMapping("/assistant/voice/session")
    public ResponseEntity<?> session(HttpServletRequest request) {
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.issue((Long) request.getAttribute("currentUserId")));
        } catch (VoiceSessionService.VoiceException error) {
            String diagnosticId = UUID.randomUUID().toString();
            LOG.warn("voice_session code={} diagnosticId={}", error.code, diagnosticId);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error_code", error.code); body.put("errorCode", error.code); body.put("diagnostic_id", diagnosticId);
            body.put("message", "语音暂时不可用，请稍后再试或继续打字");
            return ResponseEntity.status(error.status).header("Cache-Control", "no-store").body(body);
        }
    }
}
