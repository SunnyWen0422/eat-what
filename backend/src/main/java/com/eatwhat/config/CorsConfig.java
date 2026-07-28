package com.eatwhat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
    private static final List<String> ALLOWED_METHODS = Collections.unmodifiableList(
            java.util.Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

    private final List<String> allowedOrigins;

    public CorsConfig(@Value("${security.cors.allowed-origins:https://chishenme.icu}") String rawOrigins) {
        List<String> parsed = new ArrayList<>();
        if (rawOrigins != null) {
            for (String origin : rawOrigins.split(",")) {
                String normalized = origin.trim();
                if (!normalized.isEmpty() && !"*".equals(normalized)) parsed.add(normalized);
            }
        }
        this.allowedOrigins = Collections.unmodifiableList(parsed);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(allowedOrigins.toArray(new String[0]))
                .allowedMethods(ALLOWED_METHODS.toArray(new String[0]))
                .allowedHeaders("Authorization", "Content-Type", "If-None-Match", "X-Request-Id")
                .exposedHeaders("ETag", "X-Request-Id", "Retry-After")
                .allowCredentials(true)
                .maxAge(3600);
    }

    public List<String> getAllowedOrigins() { return allowedOrigins; }
    public List<String> getAllowedMethods() { return ALLOWED_METHODS; }
}
