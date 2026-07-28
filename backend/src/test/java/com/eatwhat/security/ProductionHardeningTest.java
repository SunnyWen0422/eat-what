package com.eatwhat.security;

import com.eatwhat.dto.PublicUserDTO;
import com.eatwhat.entity.User;
import com.eatwhat.service.RequestRateLimiter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductionHardeningTest {

    @Test
    void publicUserPayloadDoesNotExposeInternalWechatIdentifiers() throws Exception {
        User user = new User();
        user.setId(7L);
        user.setOpenId("openid-secret");
        user.setUnionId("union-secret");
        user.setSessionKey("session-secret");
        user.setNickname("test");

        String json = new ObjectMapper().writeValueAsString(PublicUserDTO.from(user));

        assertFalse(json.contains("openid-secret"));
        assertFalse(json.contains("union-secret"));
        assertFalse(json.contains("session-secret"));
        assertTrue(json.contains("\"nickname\":\"test\""));
    }

    @Test
    void rateLimiterDeniesRequestsAfterTheConfiguredBurst() {
        Clock clock = Clock.fixed(Instant.parse("2026-07-28T00:00:00Z"), ZoneOffset.UTC);
        RequestRateLimiter limiter = new RequestRateLimiter(2, 60_000L, clock);

        assertTrue(limiter.tryAcquire("user:7").isAllowed());
        assertTrue(limiter.tryAcquire("user:7").isAllowed());
        assertFalse(limiter.tryAcquire("user:7").isAllowed());
    }
}
