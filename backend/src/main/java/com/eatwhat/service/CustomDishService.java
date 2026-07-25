package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;
import java.util.List;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;

@Service
public class CustomDishService {

    private static final Set<String> ALLOWED_TYPES = new HashSet<>(
            Arrays.asList("meat", "veg", "soup", "staple", "dessert"));

    private final DishMapper dishMapper;
    private final RecommendationMetadataService metadataService;

    public CustomDishService(DishMapper dishMapper) {
        this(dishMapper, null);
    }

    @Autowired
    public CustomDishService(DishMapper dishMapper, RecommendationMetadataService metadataService) {
        this.dishMapper = dishMapper;
        this.metadataService = metadataService;
    }

    public Dish createDish(Long userId, Dish dish) {
        if (userId == null) {
            throw new IllegalArgumentException("userId is required");
        }
        if (dish == null || dish.getName() == null || dish.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("dish name is required");
        }
        if (dish.getType() == null || dish.getType().trim().isEmpty()) {
            throw new IllegalArgumentException("dish type is required");
        }
        dish.setName(normalizeRequiredText(dish.getName(), "dish name", 255));
        dish.setType(dish.getType().trim().toLowerCase(Locale.ROOT));
        if (!ALLOWED_TYPES.contains(dish.getType())) {
            throw new IllegalArgumentException("unsupported dish type");
        }
        dish.setCl(normalizeRequiredText(dish.getCl(), "ingredients", 10000));
        dish.setStep(normalizeRequiredText(dish.getStep(), "steps", 20000));
        dish.setFl(normalizeOptionalText(dish.getFl(), 1000, "serving description"));
        dish.setTags(normalizeOptionalText(dish.getTags(), 500, "tags"));
        if (dish.getCuisineCode() != null && !dish.getCuisineCode().trim().isEmpty()) {
            String cuisineCode = dish.getCuisineCode().trim().toUpperCase();
            if (metadataService != null && !metadataService.isKnownCuisine(cuisineCode)) {
                throw new IllegalArgumentException("unknown cuisine code");
            }
            dish.setCuisineCode(cuisineCode);
        } else {
            dish.setCuisineCode(null);
        }
        dish.setTagCodes(normalizeTagCodes(dish.getTagCodes()));
        if (dish.getCookMinutes() != null && (dish.getCookMinutes() <= 0 || dish.getCookMinutes() > 240)) {
            throw new IllegalArgumentException("cook minutes must be between 1 and 240");
        }
        dish.setMetadataVersion(metadataService == null ? 1 : metadataService.getMetadataVersion());
        dish.setUserId(userId);
        dish.setIsCustom(1);
        dishMapper.insert(dish);
        return dish;
    }

    public List<Dish> getCustomDishes(Long userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        return dishMapper.selectCustomByUser(userId);
    }

    public boolean removeCustomDish(Long userId, Long dishId) {
        if (userId == null || dishId == null) {
            return false;
        }
        return dishMapper.deleteCustomDish(userId, dishId) > 0;
    }

    private String normalizeTagCodes(String rawCodes) {
        if (rawCodes == null || rawCodes.trim().isEmpty()) return "";
        Set<String> codes = new TreeSet<>();
        for (String rawCode : rawCodes.split(",")) {
            String code = rawCode.trim().toUpperCase();
            if (code.isEmpty()) continue;
            if (metadataService != null && !metadataService.isKnownTag(code)) {
                throw new IllegalArgumentException("unknown tag code");
            }
            codes.add(code);
        }
        return String.join(",", new ArrayList<>(codes));
    }

    private String normalizeRequiredText(String value, String field, int maxLength) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " is too long");
        }
        return normalized;
    }

    private String normalizeOptionalText(String value, int maxLength, String field) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " is too long");
        }
        return normalized;
    }
}
