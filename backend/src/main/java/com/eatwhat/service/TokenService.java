package com.eatwhat.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;

@Service
public class TokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final byte[] secret;
    private final long ttlMillis;
    private final Clock clock;

    @Autowired
    public TokenService(@Value("${security.token.secret}") String secret,
                        @Value("${security.token.ttl-millis:2592000000}") long ttlMillis) {
        this(secret, ttlMillis, Clock.systemUTC());
    }

    TokenService(String secret, long ttlMillis, Clock clock) {
        if (secret == null || secret.trim().length() < 32) {
            throw new IllegalArgumentException("token secret must be at least 32 characters");
        }
        String normalized = secret.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalized.contains("change-me") || normalized.contains("password") || normalized.contains("example")) {
            throw new IllegalArgumentException("token secret must not use a placeholder");
        }
        if (ttlMillis <= 0) throw new IllegalArgumentException("token ttl must be positive");
        this.secret = secret.trim().getBytes(StandardCharsets.UTF_8);
        this.ttlMillis = ttlMillis;
        this.clock = clock;
    }

    public String generateToken(Long userId) {
        if (userId == null) throw new IllegalArgumentException("userId is required");
        long expiresAt = clock.millis() + ttlMillis;
        String payload = userId + ":" + expiresAt;
        String encodedPayload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return encodedPayload + "." + sign(encodedPayload);
    }

    public Long getUserIdFromToken(String token) {
        if (token == null || token.trim().isEmpty()) return null;
        String[] parts = token.split("\\.", -1);
        if (parts.length != 2 || !secureEquals(sign(parts[0]), parts[1])) return null;
        try {
            String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            String[] values = payload.split(":", -1);
            if (values.length != 2) return null;
            long expiresAt = Long.parseLong(values[1]);
            if (clock.millis() >= expiresAt) return null;
            return Long.valueOf(values[0]);
        } catch (RuntimeException e) {
            return null;
        }
    }

    public boolean validateToken(String token) {
        return getUserIdFromToken(token) != null;
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("unable to sign token", e);
        }
    }

    private boolean secureEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
