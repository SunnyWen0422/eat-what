package com.eatwhat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RecommendationFeatureProperties {
    private final boolean preferencesEnabled;

    public RecommendationFeatureProperties(
            @Value("${recommendation.preferences.enabled:${RECOMMENDATION_PREFERENCES_ENABLED:true}}") boolean preferencesEnabled) {
        this.preferencesEnabled = preferencesEnabled;
    }

    public boolean isPreferencesEnabled() {
        return preferencesEnabled;
    }
}
