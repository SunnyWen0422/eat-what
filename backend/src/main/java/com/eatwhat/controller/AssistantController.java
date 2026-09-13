package com.eatwhat.controller;

import com.eatwhat.service.AssistantGateway;
import com.eatwhat.service.AiProtectionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/assistant")
public class AssistantController {
    private final AssistantGateway gateway;
    private final AiProtectionService aiProtectionService;
    private final com.eatwhat.service.AssistantActionService actionService;

    /** Test-friendly constructor; Spring uses the protected constructor. */
    public AssistantController(AssistantGateway gateway) {
        this(gateway, null, null);
    }

    public AssistantController(AssistantGateway gateway, AiProtectionService aiProtectionService) {
        this(gateway, aiProtectionService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AssistantController(AssistantGateway gateway, AiProtectionService aiProtectionService,
                                com.eatwhat.service.AssistantActionService actionService) {
        this.gateway = gateway;
        this.aiProtectionService = aiProtectionService;
        this.actionService = actionService;
    }

    @PostMapping("/sessions")
    public ResponseEntity<?> createSession(@RequestBody(required = false) Map<String, Object> body,
                                           HttpServletRequest request) {
        return proxy("/assistant/sessions", withUser(body, request));
    }

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<?> getSession(@PathVariable String sessionId, HttpServletRequest request) {
        return proxyGet("/assistant/sessions/" + encodePath(sessionId) + userQuery(request));
    }

    @PostMapping("/sessions/{sessionId}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String sessionId,
                                         @RequestBody Map<String, Object> body,
                                         HttpServletRequest request) {
        if (aiProtectionService == null) {
            return proxy("/assistant/sessions/" + encodePath(sessionId) + "/messages", withUser(body, request));
        }
        AiProtectionService.Decision protection = aiProtectionService.acquire(
                currentUserId(request), clientKey(request), bodySize(body));
        if (!protection.isAllowed()) return protectionResponse(protection);
        try {
            return proxy("/assistant/sessions/" + encodePath(sessionId) + "/messages", withUser(body, request));
        } finally {
            aiProtectionService.release();
        }
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<?> deleteSession(@PathVariable String sessionId, HttpServletRequest request) {
        return proxyDelete("/assistant/sessions/" + encodePath(sessionId) + userQuery(request));
    }

    @PostMapping("/sessions/{sessionId}/actions/preview")
    public ResponseEntity<?> previewAction(@PathVariable String sessionId,
                                            @RequestBody Map<String, Object> body,
                                            HttpServletRequest request) {
        return proxy("/assistant/sessions/" + encodePath(sessionId) + "/actions/preview", withUser(body, request));
    }

    @PostMapping("/sessions/{sessionId}/undo")
    public ResponseEntity<?> undo(@PathVariable String sessionId,
                                  @RequestBody(required = false) Map<String, Object> body,
                                  HttpServletRequest request) {
        return proxy("/assistant/sessions/" + encodePath(sessionId) + "/undo", withUser(body, request));
    }

    @GetMapping("/tools")
    public ResponseEntity<?> tools() {
        return proxyGet("/assistant/tools");
    }

    @GetMapping("/tasks/{taskId}")
    public ResponseEntity<?> getTask(@PathVariable String taskId,
                                     @RequestParam(required = false) String sessionId,
                                     HttpServletRequest request) {
        String query = userQuery(request);
        if (sessionId != null && !sessionId.trim().isEmpty()) {
            query += (query.isEmpty() ? "?" : "&") + "session_id=" + encodeQuery(sessionId);
        }
        return proxyGet("/assistant/tasks/" + encodePath(taskId) + query);
    }

    @GetMapping("/tasks/{taskId}/events")
    public ResponseEntity<?> getTaskEvents(@PathVariable String taskId,
                                           @RequestParam(required = false) String sessionId,
                                           HttpServletRequest request) {
        String query = userQuery(request);
        if (sessionId != null && !sessionId.trim().isEmpty()) {
            query += (query.isEmpty() ? "?" : "&") + "session_id=" + encodeQuery(sessionId);
        }
        return proxyGet("/assistant/tasks/" + encodePath(taskId) + "/events" + query);
    }

    @PostMapping("/tasks/{taskId}/cancel")
    public ResponseEntity<?> cancelTask(@PathVariable String taskId,
                                        @RequestBody(required = false) Map<String, Object> body,
                                        HttpServletRequest request) {
        return proxy("/assistant/tasks/" + encodePath(taskId) + "/cancel", withUser(body, request));
    }

    @PostMapping("/sessions/{sessionId}/actions/confirm")
    public ResponseEntity<?> confirmAction(@PathVariable String sessionId,
                                           @RequestBody(required = false) Map<String, Object> body,
                                           HttpServletRequest request) {
        AssistantGateway.GatewayResponse approved = gateway.post("/assistant/sessions/" + encodePath(sessionId) + "/actions/confirm", withUser(body, request));
        if (!approved.isSuccessful()) return response(approved);
        if (actionService == null) return response(approved);
        Object already = approved.getBody().get("already_confirmed");
        if (Boolean.TRUE.equals(already)) return response(approved);
        Object action = approved.getBody().get("action");
        if (!(action instanceof Map)) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Collections.singletonMap("errorCode", "ASSISTANT_ACTION_INVALID"));
        }
        try {
            Long userId = currentUserId(request);
            return ResponseEntity.ok(actionService.execute(userId, castMap(action)));
        } catch (IllegalArgumentException error) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Collections.singletonMap("message", error.getMessage()));
        } catch (Exception error) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.singletonMap("errorCode", "ASSISTANT_ACTION_FAILED"));
        }
    }

    private ResponseEntity<?> proxy(String path, Map<String, Object> body) {
        try {
            return response(gateway.post(path, body));
        } catch (RestClientException | IllegalStateException error) {
            return unavailable();
        }
    }

    private ResponseEntity<?> proxyGet(String path) {
        try {
            return response(gateway.get(path));
        } catch (RestClientException | IllegalStateException error) {
            return unavailable();
        }
    }

    private ResponseEntity<?> proxyDelete(String path) {
        try {
            return response(gateway.delete(path));
        } catch (RestClientException | IllegalStateException error) {
            return unavailable();
        }
    }

    private ResponseEntity<?> response(AssistantGateway.GatewayResponse result) {
        return ResponseEntity.status(result.getStatus()).body(result.getBody());
    }

    private ResponseEntity<Map<String, Object>> unavailable() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", false);
        response.put("errorCode", "ASSISTANT_SERVICE_UNAVAILABLE");
        response.put("message", "助手暂时不可用，请稍后重试");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
    }

    private ResponseEntity<Map<String, Object>> protectionResponse(AiProtectionService.Decision decision) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", false);
        response.put("errorCode", decision.getStatusCode() == 413 ? "AI_BODY_TOO_LARGE" : "AI_RATE_LIMITED");
        response.put("message", decision.getStatusCode() == 413 ? "请求内容过大，请缩短后重试" : "请求过于频繁，请稍后重试");
        return ResponseEntity.status(decision.getStatusCode())
                .header("Retry-After", String.valueOf(Math.max(1L, decision.getRetryAfterSeconds())))
                .body(response);
    }

    private Map<String, Object> withUser(Map<String, Object> original, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (original != null) body.putAll(original);
        Long userId = currentUserId(request);
        if (userId != null) body.put("user_id", String.valueOf(userId));
        else body.remove("user_id");
        return body;
    }

    private String userQuery(HttpServletRequest request) {
        Long userId = currentUserId(request);
        return userId == null ? "" : "?user_id=" + userId;
    }

    private Long currentUserId(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        return value instanceof Number ? ((Number) value).longValue() : null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object value) {
        return (Map<String, Object>) value;
    }

    private int bodySize(Map<String, Object> body) {
        return body == null ? 0 : body.toString().getBytes(StandardCharsets.UTF_8).length;
    }

    private String clientKey(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.trim().isEmpty()) return realIp.trim();
        return request.getRemoteAddr();
    }

    private String encodePath(String value) {
        try {
            return java.net.URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException error) {
            return value == null ? "" : value;
        }
    }

    private String encodeQuery(String value) {
        try {
            return java.net.URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException error) {
            return value == null ? "" : value;
        }
    }
}
