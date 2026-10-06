package com.eatwhat.util;

import com.eatwhat.dto.ShoppingPreviewItemDTO;

public final class ShoppingIngredientKey {
    private ShoppingIngredientKey() {}
    private static String hex(String value) {
        StringBuilder out = new StringBuilder();
        for (char c : (value == null ? "" : value).toCharArray()) out.append(String.format("%04x", (int)c));
        return out.toString();
    }
    public static String of(ShoppingPreviewItemDTO item) {
        if (item.getSourceDishId() == null) return "m" + hex(item.getCanonicalName() != null ? item.getCanonicalName() : item.getId() != null ? "id_"+item.getId() : item.getClientKey());
        return "i" + hex(item.getCanonicalName() == null ? item.getDisplayName() : item.getCanonicalName()) + "v" + hex(item.getNormalizedVariant());
    }
}
