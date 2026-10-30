package com.eatwhat.service;

import com.eatwhat.dto.IngredientQuote;
import com.eatwhat.dto.ShoppingDishDTO;
import com.eatwhat.dto.ShoppingListResponse;
import com.eatwhat.dto.ShoppingPreviewItemDTO;
import com.eatwhat.util.ShoppingIngredientKey;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/** Read-only official-price estimate. Keep eligibility and rounding in sync with shopping-prices.js. */
@Service
public class ShoppingEstimateService {
    private static final BigInteger MAX_SAFE = BigInteger.valueOf(9007199254740991L);
    private final ShoppingListService shopping;
    private final ShanghaiPriceService prices;

    public ShoppingEstimateService(ShoppingListService shopping, ShanghaiPriceService prices) {
        this.shopping = shopping;
        this.prices = prices;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> summarize(Long userId) {
        if (userId == null || userId <= 0) throw new IllegalArgumentException("用户身份无效");
        return summarize(shopping.getList(userId, "all"));
    }

    /** Caller must supply its authenticated account's list, never a client-supplied list. */
    public Map<String, Object> summarize(ShoppingListResponse list) {
        Map<String, IngredientQuote> requests = new LinkedHashMap<>();
        for (ShoppingDishDTO dish : list.getDishes()) for (ShoppingPreviewItemDTO item : dish.getItems()) {
            if (item.isChecked()) continue;
            String key = key(item, dish);
            IngredientQuote request = new IngredientQuote();
            request.setIngredientKey(key);
            request.setCanonicalName(item.getCanonicalName() == null ? item.getDisplayName() : item.getCanonicalName());
            request.setNormalizedVariant(item.getNormalizedVariant() == null ? "" : item.getNormalizedVariant());
            requests.put(key, request);
        }
        Map<String, IngredientQuote> quotes = new LinkedHashMap<>();
        boolean available = true;
        List<IngredientQuote> batch = new ArrayList<>(requests.values());
        try {
            for (int start = 0; start < batch.size(); start += 500)
                quotes.putAll(prices.query(batch.subList(start, Math.min(start + 500, batch.size()))));
        } catch (RuntimeException failure) {
            // A failed estimate is unknown; the list and expenses remain usable and untouched.
            quotes.clear();
            available = false;
        }
        Map<String, Object> summary = summarize(list, quotes, LocalDate.now(ZoneId.of("Asia/Shanghai")));
        summary.put("serviceAvailable", available);
        return summary;
    }

    /** Pure shared-fixture entry point; no storage or expense access. Counts are pending source lines. */
    public static Map<String, Object> summarize(ShoppingListResponse list, Map<String, IngredientQuote> quotes, LocalDate today) {
        int covered = 0, missing = 0;
        long subtotal = 0;
        Set<String> dates = new TreeSet<>();
        List<Map<String, Object>> sources = new ArrayList<>();
        for (ShoppingDishDTO dish : list.getDishes()) for (ShoppingPreviewItemDTO item : dish.getItems()) {
            if (item.isChecked()) continue;
            String key = key(item, dish);
            IngredientQuote quote = quotes.get(key);
            Long cost = estimate(item, quote, today, key);
            if (cost == null || subtotal + cost > 9007199254740991L) { missing++; continue; }
            covered++;
            subtotal += cost;
            dates.add(quote.getQuoteDate());
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("quoteDate", quote.getQuoteDate());
            source.put("sourceUrl", quote.getSourceUrl());
            source.put("sourceLabel", quote.getSourceLabel() == null || quote.getSourceLabel().isEmpty() ? "上海市发展和改革委员会" : quote.getSourceLabel());
            if (!sources.contains(source)) sources.add(source);
        }
        boolean complete = covered > 0 && missing == 0;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scope", "pending_source_items");
        result.put("coveredCount", covered);
        result.put("missingCount", missing);
        result.put("totalCount", covered + missing);
        result.put("knownSubtotalCents", covered > 0 ? subtotal : null);
        result.put("totalCents", complete ? subtotal : null);
        result.put("complete", complete);
        result.put("quoteDates", new ArrayList<>(dates));
        result.put("sources", sources);
        return result;
    }

    private static String key(ShoppingPreviewItemDTO item, ShoppingDishDTO dish) {
        if (dish.getDishId() == null || dish.getDishId().equals(item.getSourceDishId())) return ShoppingIngredientKey.of(item);
        ShoppingPreviewItemDTO identity = new ShoppingPreviewItemDTO();
        identity.setSourceDishId(dish.getDishId());
        identity.setCanonicalName(item.getCanonicalName());
        identity.setDisplayName(item.getDisplayName());
        identity.setNormalizedVariant(item.getNormalizedVariant());
        return ShoppingIngredientKey.of(identity);
    }

    public static Long estimate(ShoppingPreviewItemDTO item, IngredientQuote quote, LocalDate today) {
        return estimate(item, quote, today, ShoppingIngredientKey.of(item));
    }

    private static Long estimate(ShoppingPreviewItemDTO item, IngredientQuote quote, LocalDate today, String key) {
        if (quote == null || !"AVAILABLE".equals(quote.getStatus()) || item.isUserOverride()
                || !"PARSED".equals(item.getParseStatus()) || !"CALCULATED".equals(item.getCalculationStatus())) return null;
        try {
            if (quote.getQuoteDate() == null || !quote.getQuoteDate().matches("\\d{4}-\\d{2}-\\d{2}")) return null;
            LocalDate date = LocalDate.parse(quote.getQuoteDate());
            if (date.isAfter(today) || date.isBefore(today.minusDays(7))) return null;
        } catch (java.time.format.DateTimeParseException invalid) { return null; }
        String name = item.getCanonicalName() == null ? item.getDisplayName() : item.getCanonicalName();
        if (quote.getIngredientKey() != null && !quote.getIngredientKey().equals(key)
                || quote.getCanonicalName() != null && !quote.getCanonicalName().equals(name)
                || (quote.getCanonicalName() != null || quote.getNormalizedVariant() != null && !quote.getNormalizedVariant().isEmpty())
                && quote.getNormalizedVariant() != null && !quote.getNormalizedVariant().equals(item.getNormalizedVariant() == null ? "" : item.getNormalizedVariant())) return null;
        int itemFactor = factor(item.getUnitCode()), quoteFactor = factor(quote.getUnitCode());
        if (itemFactor == 0 || quoteFactor == 0 || !Objects.equals(family(item.getUnitCode()), item.getUnitFamily())
                || !Objects.equals(family(quote.getUnitCode()), quote.getUnitFamily()) || !Objects.equals(item.getUnitFamily(), quote.getUnitFamily())) return null;
        BigInteger quantity = scaled(item.getQuantityValue()), price = scaled(quote.getPrice()), base = scaled(quote.getUnitQuantity());
        if (quantity == null || quantity.signum() <= 0 || price == null || price.signum() <= 0 || base == null || base.signum() <= 0) return null;
        BigInteger numerator = quantity.multiply(BigInteger.valueOf(itemFactor)).multiply(price);
        BigInteger denominator = base.multiply(BigInteger.valueOf(quoteFactor)).multiply(BigInteger.valueOf(100));
        if (numerator.compareTo(MAX_SAFE) > 0 || denominator.compareTo(MAX_SAFE) > 0) return null;
        BigInteger[] parts = numerator.divideAndRemainder(denominator);
        return parts[0].add(parts[1].multiply(BigInteger.valueOf(2)).compareTo(denominator) >= 0 ? BigInteger.ONE : BigInteger.ZERO).longValueExact();
    }

    private static BigInteger scaled(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.stripTrailingZeros().scale() > 4) return null;
        BigInteger scaled = value.movePointRight(4).toBigIntegerExact();
        return scaled.compareTo(MAX_SAFE) > 0 ? null : scaled;
    }
    private static int factor(String code) {
        return "g".equals(code) || "ml".equals(code) ? 1 : "kg".equals(code) || "l".equals(code) ? 1000 : 0;
    }
    private static String family(String code) {
        return "g".equals(code) || "kg".equals(code) ? "mass" : "ml".equals(code) || "l".equals(code) ? "volume" : null;
    }
}
