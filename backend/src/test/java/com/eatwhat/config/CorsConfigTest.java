package com.eatwhat.config;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CorsConfigTest {
    @Test
    void configuredOriginsAreExplicitAndPatchIsAllowed() {
        CorsConfig config = new CorsConfig("https://chishenme.icu, https://www.chishenme.icu");

        assertEquals(Arrays.asList("https://chishenme.icu", "https://www.chishenme.icu"), config.getAllowedOrigins());
        assertTrue(config.getAllowedMethods().contains("PATCH"));
    }
}
