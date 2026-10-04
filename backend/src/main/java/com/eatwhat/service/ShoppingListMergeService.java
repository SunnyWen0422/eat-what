package com.eatwhat.service;

import com.eatwhat.dto.ShoppingPreviewItemDTO;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ShoppingListMergeService {
    public List<ShoppingPreviewItemDTO> mergeWithinDish(Long shoppingDishId, List<ShoppingPreviewItemDTO> items) {
        if (shoppingDishId == null) throw new IllegalArgumentException("shoppingDishId不能为空");
        Map<String, ShoppingPreviewItemDTO> merged = new LinkedHashMap<>();
        if (items == null) return new ArrayList<>();
        for (ShoppingPreviewItemDTO item : items) {
            String key = shoppingDishId + "|" + safe(item.getCanonicalName()) + "|" + safe(item.getUnitFamily())
                    + "|" + safe(item.getUnitCode()) + "|" + safe(item.getNormalizedVariant());
            ShoppingPreviewItemDTO current = merged.get(key);
            if (current == null) {
                merged.put(key, item);
                continue;
            }
            if (!compatible(current, item)) {
                merged.put(key + "|" + merged.size(), item);
                continue;
            }
            if (current.getQuantityValue() != null && item.getQuantityValue() != null) {
                current.setQuantityValue(current.getQuantityValue().add(item.getQuantityValue()));
                current.setQuantityText(format(current.getQuantityValue(), current.getUnitCode()));
            }
            if (current.getWarnings() != null && item.getWarnings() != null) current.getWarnings().addAll(item.getWarnings());
        }
        return new ArrayList<>(merged.values());
    }

    public List<ShoppingPreviewItemDTO> groupByDish(List<ShoppingPreviewItemDTO> items) {
        return items == null ? new ArrayList<ShoppingPreviewItemDTO>() : new ArrayList<>(items);
    }

    private boolean compatible(ShoppingPreviewItemDTO a, ShoppingPreviewItemDTO b) {
        return !a.isUserOverride() && !b.isUserOverride()
                && "CALCULATED".equals(a.getCalculationStatus()) && "CALCULATED".equals(b.getCalculationStatus())
                && Boolean.TRUE.equals(a.getServingsVerified()) && Boolean.TRUE.equals(b.getServingsVerified())
                && "PARSED".equals(a.getParseStatus()) && "PARSED".equals(b.getParseStatus())
                && safe(a.getUnitFamily()).equals(safe(b.getUnitFamily()))
                && safe(a.getUnitCode()).equals(safe(b.getUnitCode()))
                && safe(a.getNormalizedVariant()).equals(safe(b.getNormalizedVariant()));
    }

    private String format(BigDecimal value, String unit) {
        if (value == null) return "需调整";
        return value.stripTrailingZeros().toPlainString() + (unit == null ? "" : unit);
    }

    private String safe(String value) { return value == null ? "" : value; }
}
