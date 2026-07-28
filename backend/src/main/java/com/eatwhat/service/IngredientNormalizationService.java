package com.eatwhat.service;

import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class IngredientNormalizationService {
    public String normalizeName(String name) {
        if (name == null) return "";
        return name.trim().replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    public String normalizeVariant(String preparation) {
        if (preparation == null) return "";
        return preparation.trim().replaceAll("\\s+", "");
    }
}
