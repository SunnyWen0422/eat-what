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
        if(dish.getQuality()!=null){
            com.eatwhat.dto.CatalogQuality q=dish.getQuality();
            BigDecimal base="VERIFIED".equals(q.getServingsStatus())?q.getBasePeople():null;
            if(base!=null&&base.signum()<=0)base=null;
            int line=0;
            for(com.eatwhat.dto.CatalogQuality.Ingredient fact:q.getIngredients()){
                if("REJECTED".equals(fact.getIdentityStatus()))continue;
                boolean trusted="VERIFIED".equals(q.getReviewStatus())&&fact.verifiedQuantity();
                String text=fact.getName()+"|"+(trusted?fact.getQuantityValue().stripTrailingZeros().toPlainString():"未知")+"|"+fact.getUnit()+"|"+(fact.getRole()==null?"":fact.getRole())+"|"+(fact.getPreparation()==null?"":fact.getPreparation());
                ShoppingPreviewItemDTO item=toItem(parser.parse(text,null),dish,targetPeople,trusted?base:null,line++);
                if(!trusted){item.setQuantityText("用量待核实");item.setSourceQuantityText(fact.getName()+"：用量待核实");item.getWarnings().clear();item.getWarnings().add("原用量缺少配方依据，请按实际情况填写");}
                if("unknown".equals(item.getUnitFamily())){item.setQuantityValue(null);item.setQuantityMin(null);item.setQuantityMax(null);item.setCalculationStatus("NEEDS_ADJUSTMENT");item.getWarnings().add("单位无法安全换算");}
                group.getItems().add(item);
            }
            return group;
        }
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
        if (basePeople == null) {
            item.setUnitCode(quantity == null ? null : quantity.getUnitCode());
            item.setUnitFamily(quantity == null ? "unknown" : quantity.getUnitFamily());
            item.setCalculationStatus("NEEDS_ADJUSTMENT");
            item.setQuantityText(result.getSourceText());
            item.getWarnings().add("缺少可信的原始份数，请按实际用餐人数核对原量");
            return item;
        }
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
        item.setServingsVerified(true);
        return item;
    }

    private BigDecimal parseBasePeople(String fl) {
        if (fl == null || fl.trim().isEmpty()) return null;
        // FL also contains allowance/free text in older recipes; a number inside it is not a servings source.
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(
                "^(?:serves\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:人(?:\\s*份|基础份量)?|份|servings?)?$",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(fl.trim());
        if (!matcher.matches()) return null;
        BigDecimal people = new BigDecimal(matcher.group(1));
        return people.signum() > 0 ? people : null;
    }

    private void validatePeople(BigDecimal targetPeople) {
        if (targetPeople == null || targetPeople.compareTo(BigDecimal.ONE) < 0 || targetPeople.compareTo(new BigDecimal("50")) > 0) {
            throw new IllegalArgumentException("用餐人数应在1到50之间");
        }
    }
}
