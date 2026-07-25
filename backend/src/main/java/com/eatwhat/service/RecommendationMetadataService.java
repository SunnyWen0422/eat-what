package com.eatwhat.service;

import com.eatwhat.dto.RecommendationOptionsDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.mapper.DishMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Arrays;
import java.util.LinkedHashSet;

@Service
public class RecommendationMetadataService {
    private static final Set<String> SUPPORTED_GROUPS = new LinkedHashSet<>(Arrays.asList("cuisine", "flavor", "scene", "diet", "method"));
    private final DishMapper dishMapper;
    private final int metadataVersion;
    private final String minimumClientVersion;
    private final List<RecommendationOptionsDTO.Option> homeQuickOptions;
    private final Map<String, List<RecommendationOptionsDTO.Option>> groups;
    private final Set<String> cuisineCodes = new HashSet<>();
    private final Set<String> tagCodes = new HashSet<>();
    private final Map<String, Map<String, String>> aliases = new HashMap<>();

    public RecommendationMetadataService(DishMapper dishMapper) {
        this(dishMapper, loadCatalog());
    }

    RecommendationMetadataService(DishMapper dishMapper, JsonNode root) {
        this.dishMapper = dishMapper;
        try {
            metadataVersion = root.path("metadataVersion").asInt(1);
            minimumClientVersion = root.path("minimumClientVersion").asText();
            if (minimumClientVersion.trim().isEmpty()) throw new IllegalStateException("minimumClientVersion is required");
            groups = parseGroups(root.path("groups"));
            homeQuickOptions = parseOptions(root.path("homeQuickOptions"), null);
            validateHomeOptions();
        } catch (Exception error) {
            throw new IllegalStateException("Unable to load recommendation metadata", error);
        }
    }

    public RecommendationOptionsDTO getOptions() {
        RecommendationOptionsDTO result = new RecommendationOptionsDTO();
        result.setMetadataVersion(metadataVersion);
        result.setMinimumClientVersion(minimumClientVersion);
        result.setGroups(withCounts(groups));
        result.setHomeQuickOptions(withCounts(homeQuickOptions));
        return result;
    }

    public int getMetadataVersion() {
        return metadataVersion;
    }

    public boolean isKnownCuisine(String code) {
        return code != null && cuisineCodes.contains(code.trim().toUpperCase());
    }

    public boolean isKnownTag(String code) {
        return code != null && tagCodes.contains(code.trim().toUpperCase());
    }

    public String resolveAlias(String group, String alias) {
        if (group == null || alias == null) return null;
        Map<String, String> groupAliases = aliases.get(group);
        return groupAliases == null ? null : groupAliases.get(alias.trim());
    }

    public Map<String, String> validateCriteria(RecommendationCriteria criteria) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (criteria == null) return errors;
        List<String> unknownCuisines = unknownCodes(criteria.getCuisineCodes(), true);
        List<String> unknownIncludes = unknownCodes(criteria.getIncludeTagCodes(), false);
        List<String> unknownExcludes = unknownCodes(criteria.getExcludeTagCodes(), false);
        if (!unknownCuisines.isEmpty()) errors.put("cuisineCodes", "Unknown cuisine codes: " + String.join(",", unknownCuisines));
        if (!unknownIncludes.isEmpty()) errors.put("includeTagCodes", "Unknown tag codes: " + String.join(",", unknownIncludes));
        if (!unknownExcludes.isEmpty()) errors.put("excludeTagCodes", "Unknown tag codes: " + String.join(",", unknownExcludes));
        if (criteria.getCuisineCodes() != null && criteria.getCuisineCodes().size() > 12) errors.put("cuisineCodes", "At most 12 cuisine codes are allowed");
        if (criteria.getIncludeTagCodes() != null && criteria.getIncludeTagCodes().size() > 20) errors.put("includeTagCodes", "At most 20 tag codes are allowed");
        if (criteria.getExcludeTagCodes() != null && criteria.getExcludeTagCodes().size() > 20) errors.put("excludeTagCodes", "At most 20 excluded tag codes are allowed");
        if (criteria.getExcludedIngredients() != null) {
            if (criteria.getExcludedIngredients().size() > 30) errors.put("excludedIngredients", "At most 30 excluded ingredients are allowed");
            for (String ingredient : criteria.getExcludedIngredients()) {
                if (ingredient != null && ingredient.trim().length() > 20) {
                    errors.put("excludedIngredients", "Each excluded ingredient must be at most 20 characters");
                    break;
                }
            }
        }
        if (criteria.getMaxCookMinutes() != null
                && (criteria.getMaxCookMinutes() <= 0 || criteria.getMaxCookMinutes() > 240)) {
            errors.put("maxCookMinutes", "Must be between 1 and 240");
        }
        return errors;
    }

    private List<String> unknownCodes(List<String> values, boolean cuisine) {
        List<String> unknown = new ArrayList<>();
        if (values == null) return unknown;
        for (String value : values) {
            boolean known = cuisine ? isKnownCuisine(value) : isKnownTag(value);
            if (!known) unknown.add(value == null ? "null" : value);
        }
        return unknown;
    }

    private Map<String, List<RecommendationOptionsDTO.Option>> parseGroups(JsonNode groupsNode) {
        if (!groupsNode.isObject()) throw new IllegalStateException("groups must be an object");
        Map<String, List<RecommendationOptionsDTO.Option>> result = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = groupsNode.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String group = field.getKey();
            if (!SUPPORTED_GROUPS.contains(group)) throw new IllegalStateException("Unknown metadata group: " + group);
            List<RecommendationOptionsDTO.Option> options = parseOptions(field.getValue(), group);
            result.put(group, options);
            Map<String, String> groupAliases = aliases.computeIfAbsent(group, ignored -> new HashMap<>());
            for (JsonNode optionNode : field.getValue()) {
                String code = optionNode.path("code").asText();
                Set<String> codeSet = "cuisine".equals(group) ? cuisineCodes : tagCodes;
                if (!codeSet.add(code)) throw new IllegalStateException("Duplicate code across metadata groups: " + code);
                for (JsonNode alias : optionNode.path("aliases")) {
                    String previous = groupAliases.put(alias.asText(), code);
                    if (previous != null) throw new IllegalStateException("Duplicate alias: " + alias.asText());
                }
            }
        }
        if (!result.keySet().equals(SUPPORTED_GROUPS)) throw new IllegalStateException("Metadata groups are incomplete");
        return result;
    }

    private List<RecommendationOptionsDTO.Option> parseOptions(JsonNode nodes, String defaultKind) {
        List<RecommendationOptionsDTO.Option> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode node : nodes) {
            RecommendationOptionsDTO.Option option = new RecommendationOptionsDTO.Option();
            option.setId(textOrNull(node, "id"));
            option.setCode(node.path("code").asText());
            option.setLabel(node.path("label").asText());
            option.setKind(node.hasNonNull("kind") ? node.path("kind").asText() : defaultKind);
            if (!seen.add(option.getCode())) throw new IllegalStateException("Duplicate code: " + option.getCode());
            result.add(option);
        }
        return result;
    }

    private void validateHomeOptions() {
        for (RecommendationOptionsDTO.Option option : homeQuickOptions) {
            boolean known = "cuisine".equals(option.getKind()) ? isKnownCuisine(option.getCode()) : isKnownTag(option.getCode());
            if (!known) throw new IllegalStateException("Unknown home option code: " + option.getCode());
        }
    }

    private Map<String, List<RecommendationOptionsDTO.Option>> withCounts(Map<String, List<RecommendationOptionsDTO.Option>> source) {
        Map<String, List<RecommendationOptionsDTO.Option>> result = new LinkedHashMap<>();
        for (Map.Entry<String, List<RecommendationOptionsDTO.Option>> entry : source.entrySet()) {
            result.put(entry.getKey(), withCounts(entry.getValue()));
        }
        return result;
    }

    private List<RecommendationOptionsDTO.Option> withCounts(List<RecommendationOptionsDTO.Option> source) {
        List<RecommendationOptionsDTO.Option> result = new ArrayList<>();
        for (RecommendationOptionsDTO.Option item : source) {
            RecommendationOptionsDTO.Option copy = new RecommendationOptionsDTO.Option();
            copy.setId(item.getId());
            copy.setCode(item.getCode());
            copy.setLabel(item.getLabel());
            copy.setKind(item.getKind());
            copy.setCount("cuisine".equals(item.getKind()) ? dishMapper.countByCuisineCode(item.getCode()) : dishMapper.countByTagCode(item.getCode()));
            result.add(copy);
        }
        return result;
    }

    private String textOrNull(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.path(field).asText() : null;
    }

    private static JsonNode loadCatalog() {
        try (InputStream input = new ClassPathResource("recommendation-metadata.json").getInputStream()) {
            return new ObjectMapper().readTree(input);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to load recommendation metadata", error);
        }
    }
}
