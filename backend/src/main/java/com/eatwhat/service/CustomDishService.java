package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import com.eatwhat.mapper.PersonalDishMapper;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.dto.DishWriteRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.Objects;
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
    private DishQualityService quality;
    @Autowired private CanonicalCatalogService catalog;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}
    private Dish enrich(Dish dish){return quality==null?dish:quality.enrich(dish);}
    private List<Dish> enrich(List<Dish> dishes){return quality==null?dishes:quality.enrich(dishes);}

    private static final Set<String> ALLOWED_TYPES = new HashSet<>(
            Arrays.asList("meat", "veg", "soup", "staple", "dessert", "side"));

    private final DishMapper dishMapper;
    private final RecommendationMetadataService metadataService;
    private final PersonalDishMapper personalDishes;
    private final PersonalRecipeWrites writes;
    private final ObjectMapper json;

    public CustomDishService(DishMapper dishMapper) {
        this(dishMapper, null);
    }

    public CustomDishService(DishMapper dishMapper, RecommendationMetadataService metadataService) {
        this(dishMapper, metadataService, null, null, new ObjectMapper());
    }

    @Autowired
    public CustomDishService(DishMapper dishMapper, RecommendationMetadataService metadataService,
                             PersonalDishMapper personalDishes, MealConsumptionMapper logs, ObjectMapper json) {
        this.dishMapper = dishMapper;
        this.metadataService = metadataService;
        this.personalDishes = personalDishes;
        this.writes = new PersonalRecipeWrites(logs, json);
        this.json = json;
    }

    @Transactional
    public Dish createPersonalDish(Long userId, DishWriteRequest request) {
        // Legacy callers have no receipt. New UI always supplies a stable requestId.
        if (request.getRequestId() == null) return createDish(userId, request);
        String hash = writes.begin(userId, request.getRequestId(), "dish:create", request);
        Dish replay = replayDish(userId, request.getRequestId(), hash);
        if (replay != null) return replay;
        Dish dish = copyContent(request);
        prepareDish(userId, dish);
        catalog.prepareWrite(dish);
        personalDishes.insert(dish);
        catalog.bindGeneratedId(dish); personalDishes.update(dish);
        enrich(dish);
        writes.save(userId, request.getRequestId(), hash, dish);
        return dish;
    }

    @Transactional
    public Dish copyDish(Long userId, Long sourceId, DishWriteRequest request) {
        String hash = writes.begin(userId, request.getRequestId(), "dish:copy:" + sourceId, request);
        Dish replay = replayDish(userId, request.getRequestId(), hash);
        if (replay != null) return replay;
        Dish source = readable(sourceId, userId);
        expected(source, request.getExpectedVersion());
        Dish copy = copyContent(source);
        if (Boolean.TRUE.equals(request.getEditCopy())) applyPersonalEdits(userId, source, copy, request);
        copy.setUserId(userId); copy.setIsCustom(1);
        catalog.prepareWrite(copy);
        personalDishes.insert(copy);
        catalog.bindGeneratedId(copy); personalDishes.update(copy);
        enrich(copy);
        if (quality != null) {
            if (Boolean.TRUE.equals(request.getEditCopy())) quality.inheritEditedCopy(source, copy);
            else quality.inheritCopy(source, copy);
        }
        writes.save(userId, request.getRequestId(), hash, copy);
        return copy;
    }

    @Transactional
    public Dish updatePersonalDish(Long userId, Long dishId, DishWriteRequest request) {
        String hash = writes.begin(userId, request.getRequestId(), "dish:update:" + dishId, request);
        Dish replay = replayDish(userId, request.getRequestId(), hash);
        if (replay != null) return replay;
        Dish current = owned(dishId, userId);
        expected(current, request.getExpectedVersion());
        Dish next = copyContent(current);
        next.setId(dishId);
        applyPersonalEdits(userId, current, next, request);
        if (personalDishes.update(next) != 1) throw new MealConsumptionService.VersionConflict("菜品已删除或更新，请重新读取");
        if (quality != null) quality.reconcileEdit(current, next);
        enrich(next);
        writes.save(userId, request.getRequestId(), hash, next);
        return next;
    }

    /** Merge an editor payload onto a trusted server source before its single insert/update. */
    private void applyPersonalEdits(Long userId, Dish current, Dish next, DishWriteRequest request) {
        next.setRecipe(request.getRecipe());
        next.setUserId(userId); next.setIsCustom(1);
        catalog.restoreUnchangedStepTemplates(current, next);
        catalog.prepareWrite(next);

    }

    private Dish replayDish(Long userId, String requestId, String hash) {
        com.fasterxml.jackson.databind.JsonNode receipt = writes.replay(userId, requestId, hash, com.fasterxml.jackson.databind.JsonNode.class);
        if (receipt == null) return null;
        try {
            Dish result = json.treeToValue(receipt, Dish.class);
            if (receipt.path("contentVersion").isTextual()) result.restoreReceiptContentVersion(receipt.path("contentVersion").asText());
            return result;
        } catch (java.io.IOException error) { throw new IllegalStateException("操作结果无法读取", error); }
    }

    @Transactional
    public java.util.Map<String,Object> deletePersonalDish(Long userId, Long dishId, DishWriteRequest request) {
        String hash = writes.begin(userId, request.getRequestId(), "dish:delete:" + dishId, request);
        java.util.Map replay = writes.replay(userId, request.getRequestId(), hash, java.util.Map.class);
        if (replay != null) return replay;
        Dish current = owned(dishId, userId); expected(current, request.getExpectedVersion());
        if (personalDishes.delete(dishId, userId) != 1) throw new MealConsumptionService.VersionConflict("菜品已删除或更新，请重新读取");
        java.util.Map<String,Object> result = Collections.singletonMap("success", true);
        writes.save(userId, request.getRequestId(), hash, result); return result;
    }

    private Dish readable(Long dishId, Long userId) {
        Dish dish = enrich(personalDishes.lockReadable(dishId, userId));
        if (dish == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "菜品不存在或不可访问");
        return dish;
    }
    private Dish owned(Long dishId, Long userId) {
        Dish dish = readable(dishId, userId);
        if (!Objects.equals(userId, dish.getUserId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "菜品不存在或不可访问");
        return dish;
    }
    private void expected(Dish dish, String version) {
        if (version == null || version.isEmpty()) throw new IllegalArgumentException("请提供菜品版本");
        if (!version.equals(dish.getContentVersion())) throw new MealConsumptionService.VersionConflict("菜品内容已变化，请重新读取后再操作");
    }
    private void preserveUnchangedRecipeContent(Dish current, Dish next) {
        String ingredients = current.getIngredientsAmounts() == null || current.getIngredientsAmounts().isEmpty()
                ? current.getCl() : current.getIngredientsAmounts();
        if (editorText(ingredients).equals(editorText(next.getCl()))) {
            next.setCl(current.getCl()); next.setIngredientsAmounts(current.getIngredientsAmounts());
        } else next.setIngredientsAmounts(next.getCl());
        String steps = current.getSteps() == null || current.getSteps().isEmpty() ? current.getStep() : current.getSteps();
        if (editorText(steps).equals(editorText(next.getStep()))) {
            next.setStep(current.getStep()); next.setSteps(current.getSteps()); next.setStepImages(current.getStepImages());
        } else {
            next.setSteps(next.getStep()); next.setStepImages(null);
        }
    }
    // Match the editor's JSON-array / separator representation before deciding that content changed.
    private String editorText(String value) {
        if (value == null) return "";
        String text = value;
        try {
            Object decoded = json.readValue(value, Object.class);
            if (decoded instanceof List) {
                List<String> lines = new ArrayList<>();
                for (Object line : (List<?>) decoded) lines.add(line instanceof String ? (String) line : json.writeValueAsString(line));
                text = String.join("\n", lines);
            }
        } catch (java.io.IOException ignored) { /* Plain recipe text is supported. */ }
        return text.replaceAll("###|#|\r\n?", "\n").trim();
    }
    private void canonicalManualContent(Dish dish) {
        dish.setIngredientsAmounts(dish.getCl()); dish.setSteps(dish.getStep()); dish.setStepImages(null);
    }
    private Dish copyContent(Dish from) {
        Dish to = new Dish();
        if(from instanceof DishWriteRequest&&from.getRecipe()!=null) to.setRecipe(from.getRecipe().deepCopy());
        else if(from.getRecipeJson()!=null) to.setRecipeJson(from.getRecipeJson());
        else if(from.getRecipe()!=null) to.setRecipe(from.getRecipe().deepCopy());
        to.setName(from.getName()); to.setType(from.getType()); to.setCl(from.getCl()); to.setFl(from.getFl());
        to.setStep(from.getStep()); to.setIngredientsAmounts(from.getIngredientsAmounts()); to.setSteps(from.getSteps());
        to.setStepImages(from.getStepImages()); to.setTips(from.getTips()); to.setTags(from.getTags());
        to.setCuisineCode(from.getCuisineCode()); to.setTagCodes(from.getTagCodes()); to.setCookMinutes(from.getCookMinutes());
        to.setMetadataVersion(from.getMetadataVersion()); to.setImage(from.getImage()); to.setDifficulty(from.getDifficulty());
        to.setCookTime(from.getCookTime()); to.setMethods(from.getMethods()); to.setKcal(from.getKcal());
        return to;
    }

    @Transactional
    public Dish createDish(Long userId, Dish dish) {
        prepareDish(userId, dish);
        dishMapper.insert(dish);
        catalog.bindGeneratedId(dish); dishMapper.updateCustomDish(dish);
        enrich(dish);
        return dish;
    }

    @Transactional
    public Dish updateDish(Long userId, Long dishId, Dish dish) {
        if (dishId == null) throw new IllegalArgumentException("dishId is required");
        dish.setId(dishId);
        prepareDish(userId, dish);
        Dish current = quality != null && personalDishes != null ? enrich(personalDishes.lockReadable(dishId, userId)) : null;
        if (dishMapper.updateCustomDish(dish) <= 0) return null;
        if (current != null && current.getQuality() != null) {
            // Legacy admin SQL writes a subset of fields; reconcile against what was actually stored.
            Dish saved = personalDishes.lockReadable(dishId, userId);
            quality.reconcileEdit(current, saved);
            return saved;
        }
        return dish;
    }

    public List<Dish> getCustomDishes(Long userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        return enrich(personalDishes == null ? dishMapper.selectCustomByUser(userId) : personalDishes.listOwned(userId));
    }

    public boolean removeCustomDish(Long userId, Long dishId) {
        if (userId == null || dishId == null) {
            return false;
        }
        return dishMapper.deleteCustomDish(userId, dishId) > 0;
    }

    private void prepareDish(Long userId, Dish dish) {
        if (userId == null) throw new IllegalArgumentException("userId is required");
        normalizeDish(dish);
        dish.setUserId(userId);
        dish.setIsCustom(1);
    }

    public Dish normalizeDish(Dish dish) {
        catalog.prepareWrite(dish);
        return dish;
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
