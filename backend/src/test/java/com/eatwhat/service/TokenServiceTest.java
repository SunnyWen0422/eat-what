package com.eatwhat.service;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenServiceTest {

    private static final String SECRET = "test-secret-with-sufficient-length";

    @Test
    void tokenCanBeValidatedByAnotherInstanceWithTheSameSecret() {
        Clock clock = Clock.fixed(Instant.parse("2026-07-22T00:00:00Z"), ZoneOffset.UTC);
        TokenService issuer = new TokenService(SECRET, 3600000L, clock);
        TokenService validator = new TokenService(SECRET, 3600000L, clock);

        String token = issuer.generateToken(88001L);

        assertEquals(88001L, validator.getUserIdFromToken(token));
        assertTrue(validator.validateToken(token));
    }

    @Test
    void expiredAndTamperedTokensAreRejected() {
        Clock issuedAt = Clock.fixed(Instant.parse("2026-07-22T00:00:00Z"), ZoneOffset.UTC);
        TokenService issuer = new TokenService(SECRET, 1000L, issuedAt);
        String token = issuer.generateToken(7L);
        TokenService expiredValidator = new TokenService(
                SECRET, 1000L,
                Clock.fixed(Instant.parse("2026-07-22T00:00:02Z"), ZoneOffset.UTC));

        assertNull(expiredValidator.getUserIdFromToken(token));
        assertFalse(issuer.validateToken(token + "x"));
        assertNull(issuer.getUserIdFromToken("invalid"));
    }
}
