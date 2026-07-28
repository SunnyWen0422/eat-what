package com.eatwhat.controller;

import com.eatwhat.service.ChatApplicationService;
import com.eatwhat.service.AiProtectionService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private final ChatApplicationService chatApplicationService;
    private final AiProtectionService aiProtectionService;
    private final ObjectMapper objectMapper;

    public ChatController(ChatApplicationService chatApplicationService,
                          AiProtectionService aiProtectionService,
                          ObjectMapper objectMapper) {
        this.chatApplicationService = chatApplicationService;
        this.aiProtectionService = aiProtectionService;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public void chat(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        Long userId = currentUserId(request);
        AiProtectionService.Decision protection = aiProtectionService.acquire(
                userId, clientKey(request), requestBodySize(request, body));
        if (!protection.isAllowed()) {
            writeStreamError(response, protection);
            return;
        }

        response.setContentType("text/event-stream; charset=UTF-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        OutputStream out = response.getOutputStream();
        try {
            chatApplicationService.streamChat(body, userId, out);
        } catch (Exception e) {
            log.error("Chat stream proxy failed", e);
            out.write("data: AI assistant unavailable\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
        } finally {
            aiProtectionService.release();
        }
    }

    @PostMapping("/sync")
    public ResponseEntity<?> chatSync(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AiProtectionService.Decision protection = aiProtectionService.acquire(
                currentUserId(request), clientKey(request), requestBodySize(request, body));
        if (!protection.isAllowed()) return protectionResponse(protection);
        try {
            return ResponseEntity.ok(chatApplicationService.chatSync(body, currentUserId(request)));
        } catch (Exception e) {
            log.error("Chat sync proxy failed", e);
            return ResponseEntity.status(503).body(Collections.singletonMap("success", false));
        } finally {
            aiProtectionService.release();
        }
    }

    private ResponseEntity<Map<String, Object>> protectionResponse(AiProtectionService.Decision decision) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("errorCode", decision.getStatusCode() == 413 ? "AI_BODY_TOO_LARGE" : "AI_RATE_LIMITED");
        body.put("message", decision.getStatusCode() == 413 ? "请求内容过大，请缩短后重试" : "请求过于频繁，请稍后重试");
        return ResponseEntity.status(decision.getStatusCode())
                .header("Retry-After", String.valueOf(Math.max(1L, decision.getRetryAfterSeconds())))
                .body(body);
    }

    private void writeStreamError(HttpServletResponse response, AiProtectionService.Decision decision)
            throws IOException {
        response.setStatus(decision.getStatusCode());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", String.valueOf(Math.max(1L, decision.getRetryAfterSeconds())));
        response.getWriter().write(objectMapper.writeValueAsString(protectionResponse(decision).getBody()));
    }

    private int bodySize(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsBytes(body == null ? Collections.emptyMap() : body).length;
        } catch (JsonProcessingException e) {
            return Integer.MAX_VALUE;
        }
    }

    private int requestBodySize(HttpServletRequest request, Map<String, Object> body) {
        int declaredLength = request.getContentLength();
        return Math.max(declaredLength, bodySize(body));
    }

    private String clientKey(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.trim().isEmpty()) return realIp.trim();
        return request.getRemoteAddr();
    }

    private Long currentUserId(HttpServletRequest request) {
        Object userId = request.getAttribute("currentUserId");
        return userId instanceof Long ? (Long) userId : null;
    }
}
