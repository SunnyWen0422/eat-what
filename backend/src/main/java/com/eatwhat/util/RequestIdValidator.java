package com.eatwhat.util;

import java.util.regex.Pattern;

public final class RequestIdValidator {
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9_-]{1,80}");

    private RequestIdValidator() { }

    public static void requireValid(String requestId) {
        if (requestId == null || !SAFE.matcher(requestId).matches()) {
            throw new IllegalArgumentException("requestId无效");
        }
    }
}
