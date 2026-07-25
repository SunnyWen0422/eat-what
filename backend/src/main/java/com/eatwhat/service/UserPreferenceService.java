package com.eatwhat.service;

import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.entity.UserPreference;
import com.eatwhat.mapper.UserPreferenceMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

@Service
public class UserPreferenceService {
    private final UserPreferenceMapper mapper;
    private final RecommendationMetadataService metadata;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public UserPreferenceService(UserPreferenceMapper mapper, RecommendationMetadataService metadata) {
        this.mapper = mapper;
        this.metadata = metadata;
    }

    public UserPreferenceDTO get(Long userId) {
        UserPreference stored = mapper.selectByUserId(userId);
        return stored == null ? new UserPreferenceDTO() : fromEntity(stored);
    }

    public UserPreferenceDTO save(Long userId, UserPreferenceDTO input) {
        if (userId == null) throw new IllegalArgumentException("userId is required");
        UserPreferenceDTO normalized = normalize(input == null ? new UserPreferenceDTO() : input);
        UserPreference entity = new UserPreference();
        entity.setUserId(userId);
        entity.setPreferredCuisinesJson(write(normalized.getPreferredCuisineCodes()));
        entity.setPreferredTagsJson(write(normalized.getPreferredTagCodes()));
        entity.setExcludedTagsJson(write(normalized.getExcludedTagCodes()));
        entity.setExcludedIngredientsJson(write(normalized.getExcludedIngredients()));
        entity.setAvoidRecentDays(normalized.getAvoidRecentDays());
        entity.setMaxCookMinutes(normalized.getMaxCookMinutes());
        entity.setVersion(normalized.getVersion());
        mapper.upsert(entity);
        normalized.setUpdatedAt(new Date());
        return normalized;
    }

    private UserPreferenceDTO normalize(UserPreferenceDTO input) {
        UserPreferenceDTO result = new UserPreferenceDTO();
        result.setPreferredCuisineCodes(normalizeCodes(input.getPreferredCuisineCodes(), 12, true));
        result.setPreferredTagCodes(normalizeCodes(input.getPreferredTagCodes(), 20, false));
        result.setExcludedTagCodes(normalizeCodes(input.getExcludedTagCodes(), 20, false));
        result.setExcludedIngredients(normalizeText(input.getExcludedIngredients(), 30, 20));
        int days = input.getAvoidRecentDays() == null ? 7 : input.getAvoidRecentDays();
        result.setAvoidRecentDays(Math.max(0, Math.min(30, days)));
        Integer minutes = input.getMaxCookMinutes();
        result.setMaxCookMinutes(minutes == null || minutes <= 0 ? null : Math.min(240, minutes));
        result.setVersion(Math.max(1, input.getVersion() == null ? 1 : input.getVersion()));
        result.setUpdatedAt(input.getUpdatedAt());
        return result;
    }

    private List<String> normalizeCodes(Collection<String> values, int limit, boolean cuisine) {
        Set<String> normalized = new TreeSet<>();
        if (values != null) {
            for (String value : values) {
                if (value == null || value.trim().isEmpty()) continue;
                String code = value.trim().toUpperCase();
                boolean known = cuisine ? metadata.isKnownCuisine(code) : metadata.isKnownTag(code);
                if (!known) throw new IllegalArgumentException("Unknown recommendation code: " + code);
                normalized.add(code);
                if (normalized.size() > limit) throw new IllegalArgumentException("Too many recommendation codes");
            }
        }
        return new ArrayList<>(normalized);
    }

    private List<String> normalizeText(Collection<String> values, int limit, int maxLength) {
        Set<String> normalized = new TreeSet<>();
        if (values != null) {
            for (String value : values) {
                if (value == null || value.trim().isEmpty()) continue;
                String text = value.trim();
                if (text.length() > maxLength) text = text.substring(0, maxLength);
                normalized.add(text);
                if (normalized.size() > limit) throw new IllegalArgumentException("Too many excluded ingredients");
            }
        }
        return new ArrayList<>(normalized);
    }

    private UserPreferenceDTO fromEntity(UserPreference entity) {
        UserPreferenceDTO result = new UserPreferenceDTO();
        result.setPreferredCuisineCodes(read(entity.getPreferredCuisinesJson()));
        result.setPreferredTagCodes(read(entity.getPreferredTagsJson()));
        result.setExcludedTagCodes(read(entity.getExcludedTagsJson()));
        result.setExcludedIngredients(read(entity.getExcludedIngredientsJson()));
        result.setAvoidRecentDays(entity.getAvoidRecentDays() == null ? 7 : entity.getAvoidRecentDays());
        result.setMaxCookMinutes(entity.getMaxCookMinutes());
        result.setVersion(entity.getVersion() == null ? 1 : entity.getVersion());
        result.setUpdatedAt(entity.getUpdatedAt());
        return result;
    }

    private String write(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to serialize preferences", error);
        }
    }

    private List<String> read(String value) {
        if (value == null || value.trim().isEmpty()) return new ArrayList<>();
        try {
            return objectMapper.readValue(value, new TypeReference<List<String>>() {});
        } catch (Exception error) {
            return new ArrayList<>();
        }
    }
}
