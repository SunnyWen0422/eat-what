package com.eatwhat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestOperations;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

/** Bounded dependency probe for the recommendation service. */
@Component("recommendationServiceHealthIndicator")
public class RecommendationHealthIndicator implements HealthIndicator {
    private final String healthUrl;
    private final RestOperations restOperations;

    @org.springframework.beans.factory.annotation.Autowired
    public RecommendationHealthIndicator(
            @Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl) {
        this(baseUrl, createRestTemplate());
    }

    RecommendationHealthIndicator(String baseUrl, RestOperations restOperations) {
        this.healthUrl = baseUrl.replaceAll("/+$", "") + "/health";
        this.restOperations = restOperations;
    }

    @Override
    public Health health() {
        try {
            ResponseEntity<String> response = restOperations.getForEntity(healthUrl, String.class);
            if (response.getStatusCode().is2xxSuccessful()) return Health.up().build();
            return Health.down().withDetail("status", response.getStatusCodeValue()).build();
        } catch (Exception e) {
            return Health.down().withDetail("reason", "recommendation service unavailable").build();
        }
    }

    private static RestTemplate createRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(300);
        factory.setReadTimeout(300);
        return new RestTemplate(factory);
    }
}
