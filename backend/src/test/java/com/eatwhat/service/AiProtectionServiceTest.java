package com.eatwhat.service;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiProtectionServiceTest {
    @Test
    void anonymousRequestsAreRateLimitedAndReleased() {
        AiProtectionProperties properties = new AiProtectionProperties(2, 5, 1, 1024, 60_000L);
        RequestRateLimiter limiter = new RequestRateLimiter(2, 60_000L,
                Clock.fixed(Instant.parse("2026-07-28T00:00:00Z"), ZoneOffset.UTC));
        AiProtectionService service = new AiProtectionService(properties, limiter);

        assertTrue(service.acquire(null, "127.0.0.1", 10).isAllowed());
        service.release();
        assertTrue(service.acquire(null, "127.0.0.1", 10).isAllowed());
        service.release();
        assertEquals(429, service.acquire(null, "127.0.0.1", 10).getStatusCode());

        assertEquals(413, service.acquire(null, "127.0.0.2", 2048).getStatusCode());
    }
}
