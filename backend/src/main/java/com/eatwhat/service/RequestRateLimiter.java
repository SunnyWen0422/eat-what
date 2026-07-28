package com.eatwhat.service;

import java.time.Clock;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Fixed-window limiter with bounded memory for the single-instance deployment. */
public class RequestRateLimiter {
    private static final int MAX_KEYS = 10000;

    private final int defaultLimit;
    private final long windowMillis;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new HashMap<>();

    public RequestRateLimiter(int defaultLimit, long windowMillis) {
        this(defaultLimit, windowMillis, Clock.systemUTC());
    }

    public RequestRateLimiter(int defaultLimit, long windowMillis, Clock clock) {
        if (defaultLimit <= 0 || windowMillis <= 0 || clock == null) {
            throw new IllegalArgumentException("rate limiter configuration is invalid");
        }
        this.defaultLimit = defaultLimit;
        this.windowMillis = windowMillis;
        this.clock = clock;
    }

    public synchronized Decision tryAcquire(String key) {
        return tryAcquire(key, defaultLimit);
    }

    public synchronized Decision tryAcquire(String key, int limit) {
        if (limit <= 0) return Decision.denied(1);
        String safeKey = key == null || key.trim().isEmpty() ? "anonymous" : key;
        long now = clock.millis();
        Bucket bucket = buckets.get(safeKey);
        if (bucket == null || now - bucket.windowStart >= windowMillis || bucket.limit != limit) {
            trimExpired(now);
            if (buckets.size() >= MAX_KEYS && !buckets.containsKey(safeKey)) {
                return Decision.denied(retryAfterSeconds(now));
            }
            bucket = new Bucket(now, limit);
            buckets.put(safeKey, bucket);
        }
        if (bucket.count >= limit) {
            return Decision.denied(retryAfterSeconds(bucket.windowStart));
        }
        bucket.count++;
        return Decision.allowed();
    }

    private void trimExpired(long now) {
        Iterator<Map.Entry<String, Bucket>> iterator = buckets.entrySet().iterator();
        while (iterator.hasNext()) {
            Bucket bucket = iterator.next().getValue();
            if (now - bucket.windowStart >= windowMillis) iterator.remove();
        }
    }

    private long retryAfterSeconds(long windowStart) {
        long remaining = Math.max(1L, windowMillis - Math.max(0L, clock.millis() - windowStart));
        return (remaining + 999L) / 1000L;
    }

    private static final class Bucket {
        private final long windowStart;
        private final int limit;
        private int count;

        private Bucket(long windowStart, int limit) {
            this.windowStart = windowStart;
            this.limit = limit;
        }
    }

    public static final class Decision {
        private final boolean allowed;
        private final long retryAfterSeconds;

        private Decision(boolean allowed, long retryAfterSeconds) {
            this.allowed = allowed;
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public static Decision allowed() { return new Decision(true, 0); }
        public static Decision denied(long retryAfterSeconds) { return new Decision(false, retryAfterSeconds); }
        public boolean isAllowed() { return allowed; }
        public long getRetryAfterSeconds() { return retryAfterSeconds; }
    }
}
