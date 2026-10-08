package com.eatwhat.controller;

import com.eatwhat.service.AssistantGateway;
import com.eatwhat.service.AssistantActionService;
import com.eatwhat.service.MealConsumptionService;
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
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.Objects;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;

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

    @GetMapping("/sessions")
    public ResponseEntity<?> listSessions(@RequestParam(required=false) String cursor,
            @RequestParam(defaultValue="20") int limit,HttpServletRequest request) {
        Long user=currentUserId(request);
        if(user==null)return ResponseEntity.status(401).body(Collections.singletonMap("message","请先登录查看历史"));
        if(limit<1||limit>50||cursor!=null&&cursor.length()>512)
            return ResponseEntity.badRequest().body(Collections.singletonMap("message","历史分页参数无效"));
        return proxyGet("/assistant/sessions?user_id="+user+"&limit="+limit+(cursor==null||cursor.isEmpty()?"":"&cursor="+encodeQuery(cursor)));
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

    @PostMapping("/sessions/{sessionId}/plan-commands")
    public ResponseEntity<?> planCommand(@PathVariable String sessionId,@RequestBody Map<String,Object> body,HttpServletRequest request) {
        return proxy("/assistant/sessions/"+encodePath(sessionId)+"/plan-commands",withUser(body,request));
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
        Long userId = currentUserId(request);
        if (userId == null) return confirmationError(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请先登录后确认保存");
        try {
            body = normalizeConfirmation(body);
            if (actionService == null) return unavailable();
            AssistantGateway.GatewayResponse approved;
            try {
                approved = gateway.post("/assistant/sessions/" + encodePath(sessionId) + "/actions/confirm", withUser(body, request));
            } catch (RestClientException | IllegalStateException error) {
                return unavailable();
            }
            if (!approved.isSuccessful()) return response(approved);
            Object action = approved.getBody().get("action");
            if (!Boolean.TRUE.equals(approved.getBody().get("success")) || !(action instanceof Map)) {
                return confirmationError(HttpStatus.UNPROCESSABLE_ENTITY, "ASSISTANT_ACTION_INVALID", "确认动作无效，请重新预览");
            }
            Map<String, Object> verified = castMap(action);
            if (!Objects.equals(body.get("action_type"), verified.get("type"))
                    || !Objects.equals(body.get("idempotency_key"), verified.get("idempotency_key"))
                    || confirmationVersion(body.get("plan_version")) != confirmationVersion(verified.get("plan_version"))
                    || (!Boolean.TRUE.equals(approved.getBody().get("already_confirmed"))
                        && !Objects.equals(body.get("preview_token"), verified.get("preview_token")))) {
                return confirmationError(HttpStatus.UNPROCESSABLE_ENTITY, "ASSISTANT_ACTION_INVALID", "确认动作与请求不一致，请重新预览");
            }
            // Python confirmation is authorization only. A retry must execute or replay Java's durable receipt.
            Map<String, Object> result = actionService.execute(userId, verified);
            if (result == null || !Boolean.TRUE.equals(result.get("success")) || !Boolean.TRUE.equals(result.get("executed"))) {
                return confirmationError(HttpStatus.INTERNAL_SERVER_ERROR, "ASSISTANT_ACTION_FAILED", "保存未完成，请重试");
            }
            return ResponseEntity.ok(result);
        } catch (MealConsumptionService.VersionConflict error) {
            return confirmationError(HttpStatus.CONFLICT, "ASSISTANT_ACTION_CONFLICT", error.getMessage());
        } catch (IllegalArgumentException error) {
            return confirmationError(HttpStatus.UNPROCESSABLE_ENTITY, "ASSISTANT_CONFIRMATION_INVALID", error.getMessage());
        } catch (Exception error) {
            return confirmationError(HttpStatus.INTERNAL_SERVER_ERROR, "ASSISTANT_ACTION_FAILED", "保存未完成，请重试");
        }
    }

    private Map<String, Object> normalizeConfirmation(Map<String, Object> body) {
        Set<String> fields = new HashSet<>(Arrays.asList("action_type", "plan_version", "preview_token", "idempotency_key"));
        if (body == null || !fields.equals(body.keySet())) {
            throw new IllegalArgumentException("确认仅接受操作类型、方案版本、预览凭证和幂等键；不可覆盖操作内容");
        }
        for (String field : Arrays.asList("action_type", "preview_token", "idempotency_key")) {
            if (!(body.get(field) instanceof String) || ((String) body.get(field)).trim().isEmpty()) {
                throw new IllegalArgumentException("确认凭证、操作类型和幂等键不能为空");
            }
        }
        int version = confirmationVersion(body.get("plan_version"));
        AssistantActionService.requireCalendarSave((String) body.get("action_type"));
        Map<String, Object> normalized = new LinkedHashMap<>(body);
        // Authorize and compare one integer representation, before Python consumes the preview.
        normalized.put("plan_version", version);
        return normalized;
    }

    private int confirmationVersion(Object value) {
        if (value instanceof Number) {
            try {
                int version = new BigDecimal(value.toString()).intValueExact();
                if (version > 0) return version;
            } catch (NumberFormatException | ArithmeticException ignored) {
                // Reject fractional, non-finite, and out-of-range numbers without rounding.
            }
        }
        throw new IllegalArgumentException("请提供有效的方案版本");
    }

    private ResponseEntity<Map<String, Object>> confirmationError(HttpStatus status, String code, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("success", false); error.put("errorCode", code); error.put("message", message);
        return ResponseEntity.status(status).body(error);
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
