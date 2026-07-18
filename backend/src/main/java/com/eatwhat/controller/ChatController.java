package com.eatwhat.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final String PY_CHAT_URL = "http://127.0.0.1:8000/chat";
    private static final String PY_CHAT_SYNC_URL = "http://127.0.0.1:8000/chat/sync";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate(new SimpleClientHttpRequestFactory() {{
        setConnectTimeout(5000);
        setReadTimeout(30000);
    }});

    @PostMapping
    public void chat(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        Object userId = request.getAttribute("currentUserId");
        if (userId != null) {
            body.put("user_id", userId.toString());
        }

        response.setContentType("text/event-stream; charset=UTF-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        OutputStream out = response.getOutputStream();
        try {
            restTemplate.execute(PY_CHAT_URL, HttpMethod.POST, clientRequest -> {
                clientRequest.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                byte[] json = objectMapper.writeValueAsBytes(body);
                clientRequest.getBody().write(json);
            }, clientResponse -> {
                try (InputStream input = clientResponse.getBody()) {
                    byte[] buffer = new byte[4096];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        out.write(buffer, 0, length);
                        out.flush();
                    }
                }
                return null;
            });
        } catch (Exception e) {
            log.error("Chat stream proxy failed", e);
            out.write("data: AI assistant unavailable\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    @PostMapping("/sync")
    public ResponseEntity<?> chatSync(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Object userId = request.getAttribute("currentUserId");
        if (userId != null) {
            body.put("user_id", userId.toString());
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<String> response = restTemplate.postForEntity(
                    PY_CHAT_SYNC_URL,
                    new HttpEntity<>(body, headers),
                    String.class);
            return ResponseEntity.status(response.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(response.getBody());
        } catch (Exception e) {
            log.error("Chat sync proxy failed", e);
            return ResponseEntity.status(503).body(Collections.singletonMap("success", false));
        }
    }
}
