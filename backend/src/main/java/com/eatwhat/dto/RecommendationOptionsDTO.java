package com.eatwhat.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class RecommendationOptionsDTO {
    private int metadataVersion;
    private String minimumClientVersion;
    private boolean preferencesEnabled = true;
    private List<Option> homeQuickOptions = new ArrayList<>();
    private Map<String, List<Option>> groups = new LinkedHashMap<>();

    @Data
    public static class Option {
        private String id;
        private String code;
        private String label;
        private String kind;
        private int count;
    }
}
