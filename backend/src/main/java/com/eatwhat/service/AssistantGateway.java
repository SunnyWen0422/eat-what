package com.eatwhat.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;

/** Proxy for the task-oriented recommendation service. It never executes a
 * model-proposed write; calendar and shopping writes stay in Java services. */
@Service
public class AssistantGateway {
    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public AssistantGateway(@Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl,
                            ObjectMapper objectMapper) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(factory);
    }

    public GatewayResponse get(String path) {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(baseUrl + path, String.class);
            return response(response.getStatusCode(), response.getBody());
        } catch (HttpStatusCodeException error) {
            return response(error.getStatusCode(), error.getResponseBodyAsString());
        }
    }

    public GatewayResponse post(String path, Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + path, new HttpEntity<>(payload == null ? Collections.emptyMap() : payload, headers), String.class);
            return response(response.getStatusCode(), response.getBody());
        } catch (HttpStatusCodeException error) {
            return response(error.getStatusCode(), error.getResponseBodyAsString());
        }
    }

    public GatewayResponse delete(String path) {
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    baseUrl + path, org.springframework.http.HttpMethod.DELETE, HttpEntity.EMPTY, String.class);
            return response(response.getStatusCode(), response.getBody());
        } catch (HttpStatusCodeException error) {
            return response(error.getStatusCode(), error.getResponseBodyAsString());
        }
    }

    private GatewayResponse response(HttpStatus status, String body) {
        return new GatewayResponse(status, decode(body));
    }

    private Map<String, Object> decode(String body) {
        if (body == null || body.trim().isEmpty()) return Collections.emptyMap();
        try {
            return objectMapper.readValue(body, new TypeReference<Map<String, Object>>() { });
        } catch (IOException error) {
            throw new IllegalStateException("助手服务返回了无效响应", error);
        }
    }

    /** HTTP status and decoded body are kept together so 404/409/422 errors
     * from the recommendation service are not incorrectly reported as 503. */
    public static final class GatewayResponse {
        private final HttpStatus status;
        private final Map<String, Object> body;

        private GatewayResponse(HttpStatus status, Map<String, Object> body) {
            this.status = status;
            this.body = body == null ? Collections.emptyMap() : body;
        }

        public static GatewayResponse of(HttpStatus status, Map<String, Object> body) {
            return new GatewayResponse(status, body);
        }

        public HttpStatus getStatus() { return status; }
        public Map<String, Object> getBody() { return body; }
        public boolean isSuccessful() { return status != null && status.is2xxSuccessful(); }
    }
}
