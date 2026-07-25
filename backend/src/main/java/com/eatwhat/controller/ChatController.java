package com.eatwhat.controller;

import com.eatwhat.service.ChatApplicationService;
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
import java.util.Map;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private final ChatApplicationService chatApplicationService;

    public ChatController(ChatApplicationService chatApplicationService) {
        this.chatApplicationService = chatApplicationService;
    }

    @PostMapping
    public void chat(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        Long userId = currentUserId(request);

        response.setContentType("text/event-stream; charset=UTF-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        OutputStream out = response.getOutputStream();
        try {
            chatApplicationService.streamChat(body, userId, out);
        } catch (Exception e) {
            log.error("Chat stream proxy failed", e);
            out.write("data: AI assistant unavailable\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    @PostMapping("/sync")
    public ResponseEntity<?> chatSync(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        try {
            return ResponseEntity.ok(chatApplicationService.chatSync(body, currentUserId(request)));
        } catch (Exception e) {
            log.error("Chat sync proxy failed", e);
            return ResponseEntity.status(503).body(Collections.singletonMap("success", false));
        }
    }

    private Long currentUserId(HttpServletRequest request) {
        Object userId = request.getAttribute("currentUserId");
        return userId instanceof Long ? (Long) userId : null;
    }
}
