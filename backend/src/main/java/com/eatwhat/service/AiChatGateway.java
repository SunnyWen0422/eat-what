package com.eatwhat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Map;

@Service
public class AiChatGateway {

    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public AiChatGateway(@Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl,
                         ObjectMapper objectMapper) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public Map<String, Object> chatSync(Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = restTemplate.postForEntity(
                baseUrl + "/chat/sync", new HttpEntity<>(payload, headers), String.class);
        if (response.getBody() == null || response.getBody().trim().isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(response.getBody(), new TypeReference<Map<String, Object>>() { });
        } catch (IOException e) {
            throw new IllegalStateException("AI service returned invalid JSON", e);
        }
    }

    public void streamChat(Map<String, Object> payload, OutputStream output) {
        restTemplate.execute(baseUrl + "/chat", HttpMethod.POST, request -> {
            request.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            objectMapper.writeValue(request.getBody(), payload);
        }, response -> {
            try (InputStream input = response.getBody()) {
                byte[] buffer = new byte[4096];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    output.write(buffer, 0, length);
                    output.flush();
                }
            }
            return null;
        });
    }
}
