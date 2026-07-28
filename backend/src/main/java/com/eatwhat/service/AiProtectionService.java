package com.eatwhat.service;

import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicInteger;

@Service
public class AiProtectionService {
    private final AiProtectionProperties properties;
    private final RequestRateLimiter rateLimiter;
    private final AtomicInteger inFlight = new AtomicInteger();

    public AiProtectionService(AiProtectionProperties properties) {
        this(properties, new RequestRateLimiter(properties.getAnonymousRequestsPerMinute(), properties.getWindowMillis()));
    }

    public AiProtectionService(AiProtectionProperties properties, RequestRateLimiter rateLimiter) {
        this.properties = properties;
        this.rateLimiter = rateLimiter;
    }

    public Decision acquire(Long userId, String clientKey, int bodyBytes) {
        if (bodyBytes > properties.getMaxBodyBytes()) return Decision.rejected(413, 0);
        String key = userId == null ? "ip:" + safe(clientKey) : "user:" + userId;
        int limit = userId == null
                ? properties.getAnonymousRequestsPerMinute()
                : properties.getAuthenticatedRequestsPerMinute();
        RequestRateLimiter.Decision rate = rateLimiter.tryAcquire(key, limit);
        if (!rate.isAllowed()) return Decision.rejected(429, rate.getRetryAfterSeconds());
        if (inFlight.incrementAndGet() > properties.getMaxInFlight()) {
            inFlight.decrementAndGet();
            return Decision.rejected(429, 1);
        }
        return Decision.allowed();
    }

    public void release() {
        inFlight.updateAndGet(value -> Math.max(0, value - 1));
    }

    private String safe(String value) {
        return value == null || value.trim().isEmpty() ? "unknown" : value.trim();
    }

    public static final class Decision {
        private final boolean allowed;
        private final int statusCode;
        private final long retryAfterSeconds;

        private Decision(boolean allowed, int statusCode, long retryAfterSeconds) {
            this.allowed = allowed;
            this.statusCode = statusCode;
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public static Decision allowed() { return new Decision(true, 200, 0); }
        public static Decision rejected(int statusCode, long retryAfterSeconds) {
            return new Decision(false, statusCode, retryAfterSeconds);
        }
        public boolean isAllowed() { return allowed; }
        public int getStatusCode() { return statusCode; }
        public long getRetryAfterSeconds() { return retryAfterSeconds; }
    }
}
