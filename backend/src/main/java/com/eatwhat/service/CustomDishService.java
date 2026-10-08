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

    private static final Set<String> ALLOWED_TYPES = new HashSet<>(
            Arrays.asList("meat", "veg", "soup", "staple", "dessert"));

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
        Dish replay = writes.replay(userId, request.getRequestId(), hash, Dish.class);
        if (replay != null) return replay;
        Dish dish = copyContent(request);
        prepareDish(userId, dish);
        canonicalManualContent(dish);
        personalDishes.insert(dish);
        writes.save(userId, request.getRequestId(), hash, dish);
        return dish;
    }

    @Transactional
    public Dish copyDish(Long userId, Long sourceId, DishWriteRequest request) {
        String hash = writes.begin(userId, request.getRequestId(), "dish:copy:" + sourceId, request);
        Dish replay = writes.replay(userId, request.getRequestId(), hash, Dish.class);
        if (replay != null) return replay;
        Dish source = readable(sourceId, userId);
        expected(source, request.getExpectedVersion());
        Dish copy = copyContent(source);
        copy.setUserId(userId); copy.setIsCustom(1);
        personalDishes.insert(copy);
        writes.save(userId, request.getRequestId(), hash, copy);
        return copy;
    }

    @Transactional
    public Dish updatePersonalDish(Long userId, Long dishId, DishWriteRequest request) {
        String hash = writes.begin(userId, request.getRequestId(), "dish:update:" + dishId, request);
        Dish replay = writes.replay(userId, request.getRequestId(), hash, Dish.class);
        if (replay != null) return replay;
        Dish current = owned(dishId, userId);
        expected(current, request.getExpectedVersion());
        Dish next = copyContent(current);
        next.setId(dishId); next.setName(request.getName()); next.setType(request.getType());
        next.setCl(request.getCl()); next.setStep(request.getStep()); next.setCookMinutes(request.getCookMinutes());
        // This form edits these fields only. Preserve the copied metadata/image/tips/servings.
        prepareDish(userId, next); preserveUnchangedRecipeContent(current, next);
        if (!Objects.equals(current.getCookMinutes(), next.getCookMinutes()))
            next.setCookTime(next.getCookMinutes() == null ? null : next.getCookMinutes() + "分钟");
        if (personalDishes.update(next) != 1) throw new MealConsumptionService.VersionConflict("菜品已删除或更新，请重新读取");
        writes.save(userId, request.getRequestId(), hash, next);
        return next;
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
        Dish dish = personalDishes.lockReadable(dishId, userId);
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
        to.setName(from.getName()); to.setType(from.getType()); to.setCl(from.getCl()); to.setFl(from.getFl());
        to.setStep(from.getStep()); to.setIngredientsAmounts(from.getIngredientsAmounts()); to.setSteps(from.getSteps());
        to.setStepImages(from.getStepImages()); to.setTips(from.getTips()); to.setTags(from.getTags());
        to.setCuisineCode(from.getCuisineCode()); to.setTagCodes(from.getTagCodes()); to.setCookMinutes(from.getCookMinutes());
        to.setMetadataVersion(from.getMetadataVersion()); to.setImage(from.getImage()); to.setDifficulty(from.getDifficulty());
        to.setCookTime(from.getCookTime()); to.setMethods(from.getMethods()); to.setKcal(from.getKcal());
        return to;
    }

    public Dish createDish(Long userId, Dish dish) {
        prepareDish(userId, dish);
        dishMapper.insert(dish);
        return dish;
    }

    public Dish updateDish(Long userId, Long dishId, Dish dish) {
        if (dishId == null) throw new IllegalArgumentException("dishId is required");
        prepareDish(userId, dish);
        dish.setId(dishId);
        return dishMapper.updateCustomDish(dish) > 0 ? dish : null;
    }

    public List<Dish> getCustomDishes(Long userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        return personalDishes == null ? dishMapper.selectCustomByUser(userId) : personalDishes.listOwned(userId);
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
        if (dish == null || dish.getName() == null || dish.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("dish name is required");
        }
        if (dish.getType() == null || dish.getType().trim().isEmpty()) {
            throw new IllegalArgumentException("dish type is required");
        }
        dish.setName(normalizeRequiredText(dish.getName(), "dish name", 255));
        dish.setType(dish.getType().trim().toLowerCase(Locale.ROOT));
        if (!ALLOWED_TYPES.contains(dish.getType())) throw new IllegalArgumentException("unsupported dish type");
        dish.setCl(normalizeRequiredText(dish.getCl(), "ingredients", 10000));
        dish.setStep(normalizeRequiredText(dish.getStep(), "steps", 20000));
        dish.setFl(normalizeOptionalText(dish.getFl(), 1000, "serving description"));
        dish.setTags(normalizeOptionalText(dish.getTags(), 500, "tags"));
        if (dish.getCuisineCode() != null && !dish.getCuisineCode().trim().isEmpty()) {
            String cuisineCode = dish.getCuisineCode().trim().toUpperCase(Locale.ROOT);
            if (metadataService != null && !metadataService.isKnownCuisine(cuisineCode)) {
                throw new IllegalArgumentException("unknown cuisine code");
            }
            dish.setCuisineCode(cuisineCode);
        } else {
            dish.setCuisineCode(null);
        }
        dish.setTagCodes(normalizeTagCodes(dish.getTagCodes()));
        if (dish.getCookMinutes() != null && (dish.getCookMinutes() <= 0 || dish.getCookMinutes() > 240)) {
            throw new IllegalArgumentException("cook minutes must be between 1 and 240");
        }
        dish.setMetadataVersion(metadataService == null ? 1 : metadataService.getMetadataVersion());
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
