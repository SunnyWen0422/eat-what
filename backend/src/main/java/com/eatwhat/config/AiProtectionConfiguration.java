package com.eatwhat.config;

import com.eatwhat.service.AiProtectionProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiProtectionConfiguration {

    @Bean
    public AiProtectionProperties aiProtectionProperties(
            @Value("${ai.protection.anonymous-requests-per-minute:6}") int anonymousRequestsPerMinute,
            @Value("${ai.protection.authenticated-requests-per-minute:30}") int authenticatedRequestsPerMinute,
            @Value("${ai.protection.max-in-flight:4}") int maxInFlight,
            @Value("${ai.protection.max-body-bytes:8192}") int maxBodyBytes,
            @Value("${ai.protection.window-millis:60000}") long windowMillis) {
        return new AiProtectionProperties(anonymousRequestsPerMinute, authenticatedRequestsPerMinute,
                maxInFlight, maxBodyBytes, windowMillis);
    }
}
