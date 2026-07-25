package com.eatwhat.controller;

import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.service.UserPreferenceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/users/preferences")
public class UserPreferenceController {
    private final UserPreferenceService service;

    public UserPreferenceController(UserPreferenceService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<?> get(HttpServletRequest request) {
        Long userId = currentUserId(request);
        if (userId == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(envelope(service.get(userId)));
    }

    @PutMapping
    public ResponseEntity<?> update(@RequestBody UserPreferenceDTO input, HttpServletRequest request) {
        Long userId = currentUserId(request);
        if (userId == null) return ResponseEntity.status(401).build();
        try {
            return ResponseEntity.ok(envelope(service.save(userId, input)));
        } catch (IllegalArgumentException error) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", error.getMessage());
            return ResponseEntity.badRequest().body(body);
        }
    }

    private Map<String, Object> envelope(UserPreferenceDTO preferences) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("preferences", preferences);
        return body;
    }

    private Long currentUserId(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        if (value instanceof Number) return ((Number) value).longValue();
        return value == null ? null : Long.valueOf(value.toString());
    }
}
