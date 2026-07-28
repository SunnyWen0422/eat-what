package com.eatwhat.service;

public class AiProtectionProperties {
    private final int anonymousRequestsPerMinute;
    private final int authenticatedRequestsPerMinute;
    private final int maxInFlight;
    private final int maxBodyBytes;
    private final long windowMillis;

    public AiProtectionProperties(int anonymousRequestsPerMinute, int authenticatedRequestsPerMinute,
                                  int maxInFlight, int maxBodyBytes, long windowMillis) {
        if (anonymousRequestsPerMinute <= 0 || authenticatedRequestsPerMinute <= 0
                || maxInFlight <= 0 || maxBodyBytes <= 0 || windowMillis <= 0) {
            throw new IllegalArgumentException("AI protection configuration is invalid");
        }
        this.anonymousRequestsPerMinute = anonymousRequestsPerMinute;
        this.authenticatedRequestsPerMinute = authenticatedRequestsPerMinute;
        this.maxInFlight = maxInFlight;
        this.maxBodyBytes = maxBodyBytes;
        this.windowMillis = windowMillis;
    }

    public int getAnonymousRequestsPerMinute() { return anonymousRequestsPerMinute; }
    public int getAuthenticatedRequestsPerMinute() { return authenticatedRequestsPerMinute; }
    public int getMaxInFlight() { return maxInFlight; }
    public int getMaxBodyBytes() { return maxBodyBytes; }
    public long getWindowMillis() { return windowMillis; }
}
