package com.eatwhat.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

@Service
public class AdminAuthorizationService {

    private final Set<Long> adminUserIds;

    public AdminAuthorizationService(@Value("${admin.user-ids:}") String configuredUserIds) {
        Set<Long> parsed = new HashSet<>();
        if (configuredUserIds != null) {
            for (String value : configuredUserIds.split(",")) {
                try {
                    if (!value.trim().isEmpty()) parsed.add(Long.valueOf(value.trim()));
                } catch (NumberFormatException ignored) {
                    // Invalid entries do not grant access.
                }
            }
        }
        this.adminUserIds = Collections.unmodifiableSet(parsed);
    }

    public boolean isAdmin(Long userId) {
        return userId != null && adminUserIds.contains(userId);
    }
}
