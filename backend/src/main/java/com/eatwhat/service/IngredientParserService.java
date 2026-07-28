package com.eatwhat.service;

import com.eatwhat.dto.IngredientParseResult;
import com.eatwhat.util.DecimalQuantity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 解析 food.ingredients_amounts 的结构化食材文本。 */
@Service
public class IngredientParserService {
    private static final Pattern STRUCTURED = Pattern.compile("^\\s*([^|]+)\\|([^|]+)\\|([^|]+)(?:\\|([^|]*))?(?:\\|([^|]*))?.*$");
    private static final Pattern RANGE = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*[-~至]\\s*(\\d+(?:\\.\\d+)?)");
    private static final Pattern FRACTION = Pattern.compile("(\\d+)\\s*/\\s*(\\d+)");
    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:\\.\\d+)?)");

    public IngredientParseResult parse(String sourceText, String allowanceText) {
        String text = sourceText == null ? "" : sourceText.trim();
        if (text.isEmpty()) return IngredientParseResult.failed(sourceText, "EMPTY_SOURCE");

        Matcher structured = STRUCTURED.matcher(text);
        String ingredientName = text;
        String quantityText = text;
        String unitText = "";
        String category = null;
        String preparation = null;
        if (structured.matches()) {
            ingredientName = structured.group(1).trim();
            quantityText = structured.group(2).trim();
            unitText = structured.group(3).trim();
            category = trimToNull(structured.group(4));
            preparation = trimToNull(structured.group(5));
        }

        String lower = quantityText.toLowerCase(Locale.ROOT);
        if (lower.contains("适量") || lower.contains("少许") || lower.contains("适当") || lower.contains("未知")) {
            return new IngredientParseResult("NEEDS_ADJUSTMENT", "QUALITATIVE", text, "QUALITATIVE_QUANTITY",
                    ingredientName, category, preparation, null, containsAllowance(allowanceText));
        }

        DecimalQuantity quantity = parseQuantity(quantityText, unitText);
        if (quantity == null) {
            return new IngredientParseResult("NEEDS_ADJUSTMENT", "UNKNOWN", text, "UNPARSED_QUANTITY",
                    ingredientName, category, preparation, null, containsAllowance(allowanceText));
        }
        return new IngredientParseResult("PARSED", quantity.getMin() != null ? "RANGE" : "EXACT", text,
                null, ingredientName, category, preparation, quantity, containsAllowance(allowanceText));
    }

    public List<IngredientParseResult> parseStructured(String raw, String allowanceText) {
        if (raw == null || raw.trim().isEmpty()) return Collections.emptyList();
        String[] lines = raw.split("###|\\r?\\n|#");
        List<IngredientParseResult> results = new ArrayList<>();
        for (String line : lines) {
            if (!line.trim().isEmpty()) results.add(parse(line, allowanceText));
        }
        return results;
    }

    public BigDecimal scale(BigDecimal source, BigDecimal basePeople, BigDecimal targetPeople) {
        if (source == null || basePeople == null || targetPeople == null || basePeople.signum() <= 0) {
            throw new IllegalArgumentException("人数或数量无效");
        }
        BigDecimal scaled = source.multiply(targetPeople).divide(basePeople, 4, RoundingMode.HALF_UP);
        return new BigDecimal(scaled.stripTrailingZeros().toPlainString());
    }

    public String explainAllowance(String allowanceText) {
        return containsAllowance(allowanceText) ? "SOURCE_ALLOWANCE_INCLUDED" : "NO_SOURCE_ALLOWANCE";
    }

    private DecimalQuantity parseQuantity(String quantityText, String unitText) {
        Matcher range = RANGE.matcher(quantityText);
        BigDecimal min = null;
        BigDecimal max = null;
        BigDecimal value;
        if (range.find()) {
            min = new BigDecimal(range.group(1));
            max = new BigDecimal(range.group(2));
            value = min.add(max).divide(new BigDecimal("2"), 4, RoundingMode.HALF_UP);
        } else {
            Matcher fraction = FRACTION.matcher(quantityText);
            if (fraction.find()) {
                BigDecimal denominator = new BigDecimal(fraction.group(2));
                if (denominator.signum() == 0) return null;
                value = new BigDecimal(fraction.group(1)).divide(denominator, 4, RoundingMode.HALF_UP);
            } else {
                Matcher number = NUMBER.matcher(quantityText);
                if (!number.find()) return null;
                value = new BigDecimal(number.group(1));
            }
        }
        String normalizedUnit = normalizeUnit(unitText, quantityText);
        String family = unitFamily(normalizedUnit);
        return new DecimalQuantity(value, min, max, normalizedUnit, family, quantityText);
    }

    private String normalizeUnit(String unitText, String quantityText) {
        String unit = unitText == null ? "" : unitText.trim();
        if (unit.isEmpty()) {
            if (quantityText.contains("千克") || quantityText.contains("公斤")) return "kg";
            if (quantityText.contains("克")) return "g";
            if (quantityText.contains("毫升")) return "ml";
            if (quantityText.contains("升")) return "l";
            if (quantityText.contains("个") || quantityText.contains("只") || quantityText.contains("枚")) return "count";
            return "unknown";
        }
        if (unit.contains("千克") || unit.contains("公斤") || unit.equalsIgnoreCase("kg")) return "kg";
        if (unit.equals("克") || unit.equalsIgnoreCase("g")) return "g";
        if (unit.contains("毫升") || unit.equalsIgnoreCase("ml")) return "ml";
        if (unit.equals("升") || unit.equalsIgnoreCase("l")) return "l";
        if (unit.contains("个") || unit.contains("只") || unit.contains("枚") || unit.contains("根")) return "count";
        return unit;
    }

    private String unitFamily(String unit) {
        if ("g".equals(unit) || "kg".equals(unit)) return "mass";
        if ("ml".equals(unit) || "l".equals(unit)) return "volume";
        if ("count".equals(unit)) return "count";
        return "unknown";
    }

    private boolean containsAllowance(String allowanceText) {
        return allowanceText != null && allowanceText.contains("15%");
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        return value.trim();
    }
}
