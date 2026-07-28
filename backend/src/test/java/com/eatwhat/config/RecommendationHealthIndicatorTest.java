package com.eatwhat.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestOperations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationHealthIndicatorTest {
    @Test
    void dependencyHealthIsUpForSuccessfulProbe() {
        RestOperations rest = mock(RestOperations.class);
        when(rest.getForEntity("http://recommend/health", String.class))
                .thenReturn(new ResponseEntity<>("ok", HttpStatus.OK));

        Health health = new RecommendationHealthIndicator("http://recommend/", rest).health();

        assertEquals("UP", health.getStatus().getCode());
    }

    @Test
    void dependencyHealthIsDownWithoutLeakingExceptionDetails() {
        RestOperations rest = mock(RestOperations.class);
        when(rest.getForEntity("http://recommend/health", String.class))
                .thenThrow(new IllegalStateException("secret connection details"));

        Health health = new RecommendationHealthIndicator("http://recommend", rest).health();

        assertEquals("DOWN", health.getStatus().getCode());
        assertEquals("recommendation service unavailable", health.getDetails().get("reason"));
    }
}
