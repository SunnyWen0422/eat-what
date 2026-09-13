package com.eatwhat.service;

import com.eatwhat.dto.IngredientParseResult;
import com.eatwhat.dto.ShoppingDishDTO;
import com.eatwhat.dto.ShoppingPreviewItemDTO;
import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.dto.ShoppingPreviewResponse;
import com.eatwhat.entity.Dish;
import com.eatwhat.util.DecimalQuantity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Service
public class ShoppingPreviewService {
    private final DishQueryService dishQueryService;
    private final IngredientParserService parser;
    private final IngredientNormalizationService normalization;

    public ShoppingPreviewService(DishQueryService dishQueryService,
                                   IngredientParserService parser,
                                   IngredientNormalizationService normalization) {
        this.dishQueryService = dishQueryService;
        this.parser = parser;
        this.normalization = normalization;
    }

    public ShoppingPreviewResponse createPreview(Long userId, ShoppingPreviewRequest request) {
        validatePeople(request.getTargetPeople());
        List<Dish> dishes = dishQueryService.getDishesByIdsForUser(request.getDishIds(), userId);
        List<ShoppingDishDTO> groups = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        for (int index = 0; index < dishes.size(); index++) {
            ShoppingDishDTO group = buildDishPreview(dishes.get(index), request.getTargetPeople(), index);
            groups.add(group);
            for (ShoppingPreviewItemDTO item : group.getItems()) {
                if (!"CALCULATED".equals(item.getCalculationStatus())) {
                    warnings.add(group.getDishName() + "：" + item.getDisplayName() + "需按实际情况调整");
                }
            }
        }
        return new ShoppingPreviewResponse(request.getClientRequestId(), groups, warnings, 1);
    }

    private ShoppingDishDTO buildDishPreview(Dish dish, BigDecimal targetPeople, int index) {
        ShoppingDishDTO group = new ShoppingDishDTO();
        group.setSelectionKey("dish-" + dish.getId() + "-" + index);
        group.setDishId(dish.getId());
        group.setDishName(dish.getName());
        group.setTargetPeople(targetPeople);
        String raw = dish.getIngredientsAmounts();
        if (raw == null || raw.trim().isEmpty()) raw = dish.getCl();
        BigDecimal basePeople = parseBasePeople(dish.getFl());
        List<IngredientParseResult> parsed = parser.parseStructured(raw, dish.getFl());
        int line = 0;
        for (IngredientParseResult result : parsed) {
            ShoppingPreviewItemDTO item = toItem(result, dish, targetPeople, basePeople, line++);
            group.getItems().add(item);
        }
        return group;
    }

    private ShoppingPreviewItemDTO toItem(IngredientParseResult result, Dish dish, BigDecimal targetPeople,
                                          BigDecimal basePeople, int line) {
        ShoppingPreviewItemDTO item = new ShoppingPreviewItemDTO();
        DecimalQuantity quantity = result.getQuantity();
        item.setClientKey("dish-" + dish.getId() + "-ing-" + line);
        item.setCanonicalName(normalization.normalizeName(result.getIngredientName()));
        item.setDisplayName(result.getIngredientName());
        item.setNormalizedVariant(normalization.normalizeVariant(result.getPreparation()));
        item.setSourceDishId(dish.getId());
        item.setSourceDishName(dish.getName());
        item.setSourceLineNo(line);
        item.setSourceQuantityText(result.getSourceText());
        item.setSourceBasePeople(basePeople);
        item.setParseStatus(result.getParseStatus());
        item.setQuantityKind(result.getQuantityKind());
        item.setWarnings(new ArrayList<String>());
        if (quantity == null || quantity.getValue() == null) {
            item.setCalculationStatus("NEEDS_ADJUSTMENT");
            item.setQuantityText(result.getSourceText());
            item.getWarnings().add(result.getMessage() == null ? "数量无法自动解析" : result.getMessage());
            return item;
        }
        BigDecimal scaled = parser.scale(quantity.getValue(), basePeople, targetPeople);
        if ("count".equals(quantity.getUnitFamily())) scaled = scaled.setScale(0, RoundingMode.CEILING);
        item.setQuantityValue(scaled);
        item.setQuantityMin(quantity.getMin() == null ? null : parser.scale(quantity.getMin(), basePeople, targetPeople));
        item.setQuantityMax(quantity.getMax() == null ? null : parser.scale(quantity.getMax(), basePeople, targetPeople));
        item.setUnitCode(quantity.getUnitCode());
        item.setUnitFamily(quantity.getUnitFamily());
        item.setQuantityText(scaled.stripTrailingZeros().toPlainString() + quantity.getUnitCode());
        item.setCalculationStatus("CALCULATED");
        return item;
    }

    private BigDecimal parseBasePeople(String fl) {
        if (fl == null || fl.trim().isEmpty()) return new BigDecimal("2");
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)").matcher(fl);
        if (matcher.find()) return new BigDecimal(matcher.group(1));
        return new BigDecimal("2");
    }

    private void validatePeople(BigDecimal targetPeople) {
        if (targetPeople == null || targetPeople.compareTo(BigDecimal.ONE) < 0 || targetPeople.compareTo(new BigDecimal("50")) > 0) {
            throw new IllegalArgumentException("用餐人数应在1到50之间");
        }
    }
}
