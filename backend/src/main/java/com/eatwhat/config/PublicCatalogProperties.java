package com.eatwhat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.*;

/** Development does not opt existing published recipes into anonymous distribution. */
@Component
@ConfigurationProperties(prefix = "public-catalog")
public class PublicCatalogProperties {
    public static final long MAX_SAFE_ID = 9007199254740991L;
    public static final int MAX_RELEASE_IDS = 500;
    private boolean enabled = false;
    private List<Long> allowedDishIds = Collections.emptyList();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public List<Long> getAllowedDishIds() { return allowedDishIds; }
    public void setAllowedDishIds(List<Long> value) {
        if (value == null || value.size() > MAX_RELEASE_IDS) throw new IllegalArgumentException("Invalid public catalog release list");
        Set<Long> unique = new HashSet<>();
        for (Long id : value) if (id == null || id <= 0 || id > MAX_SAFE_ID || !unique.add(id)) throw new IllegalArgumentException("Invalid public catalog release list");
        allowedDishIds = Collections.unmodifiableList(new ArrayList<>(value));
    }
}
