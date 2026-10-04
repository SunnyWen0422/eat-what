package com.eatwhat.service;

import com.eatwhat.dto.PurchaseSummaryDTO;
import com.eatwhat.dto.PurchaseSummaryItemDTO;
import com.eatwhat.dto.ShoppingBatchAddRequest;
import com.eatwhat.dto.ShoppingClearRequest;
import com.eatwhat.dto.ShoppingDishDTO;
import com.eatwhat.dto.ShoppingDishRequest;
import com.eatwhat.dto.ShoppingItemPatchRequest;
import com.eatwhat.dto.ShoppingListResponse;
import com.eatwhat.dto.ShoppingPreviewItemDTO;
import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.dto.ShoppingPreviewResponse;
import com.eatwhat.dto.ShoppingSyncResponse;
import com.eatwhat.entity.ShoppingDish;
import com.eatwhat.entity.ShoppingItem;
import com.eatwhat.entity.ShoppingList;
import com.eatwhat.entity.ShoppingRequestLog;
import com.eatwhat.mapper.ShoppingDishMapper;
import com.eatwhat.mapper.ShoppingItemMapper;
import com.eatwhat.mapper.ShoppingListMapper;
import com.eatwhat.mapper.ShoppingRequestLogMapper;
import com.eatwhat.util.RequestIdValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ShoppingListService {
    private MealBehaviorService behavior;
    @org.springframework.beans.factory.annotation.Autowired
    public void setMealBehaviorService(MealBehaviorService behavior) { this.behavior=behavior; }

    private final ShoppingListMapper listMapper;
    private final ShoppingDishMapper dishMapper;
    private final ShoppingItemMapper itemMapper;
    private final ShoppingRequestLogMapper logMapper;
    private final ShoppingListMergeService mergeService;
    private final ShoppingPreviewService previewService;
    private final ObjectMapper objectMapper;

    public ShoppingListService(ShoppingListMapper listMapper, ShoppingDishMapper dishMapper,
                               ShoppingItemMapper itemMapper, ShoppingRequestLogMapper logMapper,
                               ShoppingListMergeService mergeService, ShoppingPreviewService previewService,
                               ObjectMapper objectMapper) {
        this.listMapper = listMapper;
        this.dishMapper = dishMapper;
        this.itemMapper = itemMapper;
        this.logMapper = logMapper;
        this.mergeService = mergeService;
        this.previewService = previewService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public ShoppingListResponse getList(Long userId, String status) {
        ShoppingList list = listMapper.findByUserId(userId);
        if (list == null) return emptyResponse();
        List<ShoppingDish> groups = dishMapper.findByListId(list.getId());
        List<ShoppingItem> allItems = itemMapper.findByListId(list.getId(), status == null ? "all" : status);
        ShoppingListResponse response = new ShoppingListResponse();
        response.setListId(list.getId());
        response.setVersion(list.getVersion());
        response.setMetadataVersion(list.getMetadataVersion() == null ? 1 : list.getMetadataVersion());
        for (ShoppingDish group : groups) {
            ShoppingDishDTO dto = new ShoppingDishDTO();
            dto.setShoppingDishId(group.getId());
            dto.setSelectionKey(group.getSelectionKey());
            dto.setDishId(group.getDishId());
            dto.setDishName(group.getDishName());
            dto.setTargetPeople(group.getTargetPeople());
            dto.setSourceDate(group.getSourceDate());
            dto.setSourceMealType(group.getSourceMealType());
            for (ShoppingItem item : allItems) {
                if (group.getId().equals(item.getShoppingDishId())) dto.getItems().add(toPreviewItem(item, group));
            }
            response.getDishes().add(dto);
        }
        response.setPurchaseSummary(buildSummary(response.getDishes()));
        calculateCounts(response, allItems);
        return response;
    }

    @Transactional
    public ShoppingSyncResponse batchAdd(Long userId, ShoppingBatchAddRequest request) {
        RequestIdValidator.requireValid(request.getRequestId());
        logMapper.lockUser(userId);
        String requestHash = requestHash(request);
        ShoppingRequestLog existing = logMapper.findSuccess(userId, request.getRequestId());
        if (existing != null) {
            if (!requestHash.equals(existing.getRequestHash()))
                throw new MealConsumptionService.VersionConflict("请求标识已用于不同购物操作");
            try {
                return new ShoppingSyncResponse(objectMapper.readValue(existing.getResponseJson(), ShoppingListResponse.class), true);
            } catch (Exception error) { throw new IllegalStateException("采购请求记录无法读取，请联系管理员", error); }
        }
        requireVersion(request.getExpectedListVersion());
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, request.getExpectedListVersion());
        if (request.getDishes() != null) {
            for (ShoppingDishRequest groupRequest : trustedDishes(userId, request)) {
                ShoppingDish group = dishMapper.findBySelectionKey(list.getId(), groupRequest.getSelectionKey());
                if (group == null) {
                    group = new ShoppingDish();
                    group.setShoppingListId(list.getId());
                    group.setSelectionKey(groupRequest.getSelectionKey());
                    ShoppingPreviewItemDTO first = first(groupRequest.getItems());
                    group.setDishId(first == null ? null : first.getSourceDishId());
                    group.setDishName(first == null ? "未命名菜品" : first.getSourceDishName());
                    group.setTargetPeople(groupRequest.getTargetPeople());
                    group.setSourceDate(groupRequest.getSourceDate());
                    group.setSourceMealType(groupRequest.getSourceMealType());
                    dishMapper.insert(group);
                }
                group.setSourceDate(groupRequest.getSourceDate()); group.setSourceMealType(groupRequest.getSourceMealType());
                group.setTargetPeople(groupRequest.getTargetPeople()); dishMapper.updateSource(group);
                ShoppingPreviewItemDTO source = first(groupRequest.getItems());
                if (!java.util.Objects.equals(group.getDishId(), source.getSourceDishId()))
                    throw new MealConsumptionService.VersionConflict("分组来源已变化，请重新预览");
                // Persist raw source lines. Only the display summary may aggregate quantities.
                Set<Integer> selectedLines = new HashSet<>();
                for (ShoppingPreviewItemDTO item : groupRequest.getItems()) selectedLines.add(item.getSourceLineNo());
                for (ShoppingItem old : itemMapper.findByListId(list.getId(), "all")) {
                    if (!group.getId().equals(old.getShoppingDishId()) || selectedLines.contains(old.getSourceLineNo())) continue;
                    if (Boolean.TRUE.equals(old.getChecked()) || Boolean.TRUE.equals(old.getUserOverride()))
                        throw new MealConsumptionService.VersionConflict("原清单含已购或手动调整的食材，请先在清单中确认移除后重新采购");
                    itemMapper.delete(old.getId(), list.getId());
                }
                for (ShoppingPreviewItemDTO item : groupRequest.getItems()) {
                    ShoppingItem entity = toEntity(group, item);
                    ShoppingItem existingItem = itemMapper.findBySource(group.getId(), entity.getSourceLineNo());
                    if (existingItem == null) itemMapper.insert(entity);
                    else {
                        // A repeated selection must retain the shopper's purchased and manual decisions.
                        if (Boolean.TRUE.equals(existingItem.getUserOverride())) continue;
                        entity.setId(existingItem.getId());
                        entity.setChecked(existingItem.getChecked());
                        itemMapper.update(entity, list.getId());
                    }
                }
            }
        }
        long nextVersion = (list.getVersion() == null ? 0 : list.getVersion()) + 1;
        listMapper.updateVersion(list.getId(), userId, nextVersion, list.getMetadataVersion() == null ? 1 : list.getMetadataVersion());
        ShoppingListResponse response = getList(userId, "all");
        if (behavior!=null) for (ShoppingDishRequest source : request.getDishes()) behavior.domain(userId,source.getSourceDate(),source.getSourceMealType(),request.getRequestId(),"shopping_confirmed");
        try {
            logMapper.insertBoundSuccess(userId, request.getRequestId(), requestHash, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            throw new IllegalStateException("保存请求日志失败", e);
        }
        return new ShoppingSyncResponse(response, false);
    }

    @Transactional
    public ShoppingListResponse patchItem(Long userId, Long itemId, ShoppingItemPatchRequest patch) {
        if (patch == null) throw new IllegalArgumentException("修改内容不能为空");
        requireVersion(patch.getExpectedListVersion());
        if (patch.getDisplayName() != null && (patch.getDisplayName().trim().isEmpty() || patch.getDisplayName().trim().length() > 255)) {
            throw new IllegalArgumentException("食材名称长度无效");
        }
        if (patch.getQuantityValue() != null && patch.getQuantityValue().signum() < 0) {
            throw new IllegalArgumentException("食材用量不能为负数");
        }
        if (patch.getQuantityText() != null && patch.getQuantityText().trim().length() > 255) {
            throw new IllegalArgumentException("食材用量文本过长");
        }
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, patch.getExpectedListVersion());
        ShoppingItem item = itemMapper.findById(itemId, list.getId());
        if (item == null) throw new NotFoundException("购物项目不存在");
        if (patch.getUnitCode() != null && !sameUnitFamily(item.getUnitFamily(), patch.getUnitCode())) {
            throw new IllegalArgumentException("不能跨单位族修改食材用量");
        }
        if (!Boolean.TRUE.equals(item.getUserOverride()) && ("CALCULATED".equals(item.getCalculationStatus())
                || "NEEDS_ADJUSTMENT".equals(item.getCalculationStatus()))) {
            // Editing a label or checked flag does not confirm an inferred historical amount.
            item.setQuantityValue(null); item.setQuantityMin(null); item.setQuantityMax(null);
            if (item.getSourceQuantityText() != null && !item.getSourceQuantityText().trim().isEmpty())
                item.setQuantityText(item.getSourceQuantityText());
            item.setCalculationStatus("NEEDS_ADJUSTMENT");
        }
        if (patch.getDisplayName() != null) item.setDisplayName(patch.getDisplayName().trim());
        if (patch.getQuantityValue() != null) item.setQuantityValue(patch.getQuantityValue());
        if (patch.getQuantityText() != null) item.setQuantityText(patch.getQuantityText());
        if (patch.getUnitCode() != null) item.setUnitCode(patch.getUnitCode());
        if (patch.getChecked() != null) item.setChecked(patch.getChecked());
        boolean edited = patch.getDisplayName() != null || patch.getQuantityValue() != null
                || patch.getQuantityText() != null || patch.getUnitCode() != null;
        if (edited) { item.setUserOverride(true); item.setCalculationStatus("USER_OVERRIDE"); }
        if (patch.getQuantityText() != null && patch.getQuantityValue() == null) {
            item.setQuantityValue(null); item.setQuantityMin(null); item.setQuantityMax(null);
        }
        itemMapper.update(item, list.getId());
        increment(list, userId);
        return getList(userId, "all");
    }

    @Transactional
    public ShoppingListResponse deleteItem(Long userId, Long itemId, Long expectedListVersion) {
        requireVersion(expectedListVersion);
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, expectedListVersion);
        if (itemMapper.delete(itemId, list.getId()) == 0) throw new NotFoundException("购物项目不存在");
        dishMapper.removeEmpty(list.getId());
        increment(list, userId);
        return getList(userId, "all");
    }

    @Transactional
    public ShoppingListResponse clear(Long userId, ShoppingClearRequest request) {
        RequestIdValidator.requireValid(request.getRequestId());
        logMapper.lockUser(userId);
        String requestHash = requestHash(request);
        ShoppingRequestLog existing = logMapper.findSuccess(userId, request.getRequestId());
        if (existing != null) {
            if (!requestHash.equals(existing.getRequestHash()))
                throw new MealConsumptionService.VersionConflict("请求标识已用于不同购物操作");
            try {
                return objectMapper.readValue(existing.getResponseJson(), ShoppingListResponse.class);
            } catch (Exception error) { throw new IllegalStateException("清空请求记录无法读取，请联系管理员", error); }
        }
        requireVersion(request.getExpectedListVersion());
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, request.getExpectedListVersion());
        if (!"all".equals(request.getScope()) && !"checked".equals(request.getScope()))
            throw new IllegalArgumentException("清空范围应为 all 或 checked");
        if ("all".equalsIgnoreCase(request.getScope())) itemMapper.deleteAll(list.getId());
        else itemMapper.deleteChecked(list.getId());
        dishMapper.removeEmpty(list.getId());
        increment(list, userId);
        ShoppingListResponse response = getList(userId, "all");
        try {
            logMapper.insertBoundSuccess(userId, request.getRequestId(), requestHash, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            throw new IllegalStateException("保存请求日志失败", e);
        }
        return response;
    }

    private String requestHash(Object request) {
        try { return com.eatwhat.util.WorkflowRequestHash.sha256(request.getClass().getSimpleName() + "|" + objectMapper.writeValueAsString(request)); }
        catch (Exception error) { throw new IllegalStateException("购物请求无法序列化", error); }
    }

    private List<ShoppingDishRequest> trustedDishes(Long userId, ShoppingBatchAddRequest request) {
        if (request.getDishes() == null || request.getDishes().isEmpty() || request.getDishes().size() > 500)
            throw new IllegalArgumentException("采购分组应为 1 至 500 个");
        List<ShoppingDishRequest> normalized = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        int totalItems = 0;
        Map<String, ShoppingPreviewResponse> previewCache = new HashMap<>();
        for (ShoppingDishRequest group : request.getDishes()) {
            if (group == null || group.getSelectionKey() == null || group.getSelectionKey().trim().isEmpty()
                    || group.getSelectionKey().length() > 120 || !keys.add(group.getSelectionKey().trim()))
                throw new IllegalArgumentException("菜品分组缺少唯一稳定标识");
            if (group.getItems() == null || group.getItems().isEmpty()) continue;
            if (group.getItems().size() > 100) throw new IllegalArgumentException("单个分组食材过多");
            if (group.getSourceDate() != null) MealConsumptionService.date(group.getSourceDate());
            if (group.getSourceMealType() != null && !java.util.Arrays.asList("breakfast","lunch","dinner").contains(group.getSourceMealType()))
                throw new IllegalArgumentException("采购餐次无效");
            totalItems += group.getItems().size();
            if (totalItems > 5000) throw new IllegalArgumentException("一次采购最多 5000 个来源项目，请按周准备");
            Set<String> lines = new HashSet<>();
            Set<Long> ids = new HashSet<>();
            for (ShoppingPreviewItemDTO item : group.getItems()) {
                if (item == null || item.getSourceDishId() == null || item.getSourceLineNo() == null)
                    throw new IllegalArgumentException("购物项目缺少来源");
                if (!lines.add(sourceKey(item.getSourceDishId(),item.getSourceLineNo()))) throw new IllegalArgumentException("食材来源行重复");
                ids.add(item.getSourceDishId());
            }
            if (ids.size() != 1) throw new IllegalArgumentException("每个采购分组只能来自一道菜");
            ShoppingPreviewRequest preview = new ShoppingPreviewRequest();
            preview.setDishIds(new ArrayList<>(ids));
            preview.setTargetPeople(group.getTargetPeople() != null ? group.getTargetPeople()
                : request.getTargetPeople() != null ? request.getTargetPeople() : new BigDecimal("2"));
            String previewKey = ids.iterator().next()+"@"+preview.getTargetPeople().stripTrailingZeros().toPlainString();
            ShoppingPreviewResponse trusted = previewCache.get(previewKey);
            if (trusted == null) { trusted = previewService.createPreview(userId, preview); previewCache.put(previewKey,trusted); }
            Map<String,ShoppingPreviewItemDTO> allowed = new HashMap<>();
            for (ShoppingDishDTO dish : trusted.getDishes()) for (ShoppingPreviewItemDTO item : dish.getItems())
                allowed.put(sourceKey(item.getSourceDishId(),item.getSourceLineNo()),item);
            ShoppingDishRequest copy = new ShoppingDishRequest();
            copy.setSelectionKey(group.getSelectionKey().trim()); copy.setSourceDate(group.getSourceDate());
            copy.setSourceMealType(group.getSourceMealType()); copy.setTargetPeople(preview.getTargetPeople());
            for (ShoppingPreviewItemDTO incoming : group.getItems()) {
                ShoppingPreviewItemDTO source = allowed.get(sourceKey(incoming.getSourceDishId(),incoming.getSourceLineNo()));
                if (source == null) throw new IllegalArgumentException("购物项目来源已失效，请重新预览");
                copy.getItems().add(mergeClientOverride(source,incoming));
            }
            normalized.add(copy);
        }
        if (normalized.isEmpty()) throw new IllegalArgumentException("请至少保留一项食材");
        return normalized;
    }

    private ShoppingPreviewItemDTO mergeClientOverride(ShoppingPreviewItemDTO source, ShoppingPreviewItemDTO incoming) {
        ShoppingPreviewItemDTO result = copyItem(source);
        result.setChecked(incoming.isChecked());
        if (!incoming.isUserOverride()) return result;
        if (incoming.getDisplayName() != null && incoming.getDisplayName().trim().length() <= 255) {
            result.setDisplayName(incoming.getDisplayName().trim());
        }
        if (incoming.getQuantityValue() != null && incoming.getQuantityValue().signum() >= 0) {
            result.setQuantityValue(incoming.getQuantityValue());
        }
        if (incoming.getQuantityText() != null && incoming.getQuantityText().trim().length() <= 255) {
            result.setQuantityText(incoming.getQuantityText().trim());
            if (incoming.getQuantityValue() == null) { result.setQuantityValue(null); result.setQuantityMin(null); result.setQuantityMax(null); }
        }
        if (incoming.getUnitCode() != null && sameUnitFamily(source.getUnitFamily(), incoming.getUnitCode())) {
            result.setUnitCode(incoming.getUnitCode().trim());
        }
        result.setUserOverride(true);
        result.setCalculationStatus("USER_OVERRIDE");
        return result;
    }

    private ShoppingPreviewItemDTO copyItem(ShoppingPreviewItemDTO source) {
        ShoppingPreviewItemDTO copy = new ShoppingPreviewItemDTO();
        copy.setClientKey(source.getClientKey());
        copy.setCanonicalName(source.getCanonicalName());
        copy.setDisplayName(source.getDisplayName());
        copy.setNormalizedVariant(source.getNormalizedVariant());
        copy.setQuantityKind(source.getQuantityKind());
        copy.setQuantityValue(source.getQuantityValue());
        copy.setQuantityMin(source.getQuantityMin());
        copy.setQuantityMax(source.getQuantityMax());
        copy.setQuantityText(source.getQuantityText());
        copy.setUnitCode(source.getUnitCode());
        copy.setUnitFamily(source.getUnitFamily());
        copy.setSourceQuantityText(source.getSourceQuantityText());
        copy.setSourceDishId(source.getSourceDishId());
        copy.setSourceDishName(source.getSourceDishName());
        copy.setSourceLineNo(source.getSourceLineNo());
        copy.setSourceBasePeople(source.getSourceBasePeople());
        copy.setServingsVerified(source.getServingsVerified());
        copy.setCalculationStatus(source.getCalculationStatus());
        copy.setParseStatus(source.getParseStatus());
        copy.setUserOverride(source.isUserOverride());
        copy.setChecked(source.isChecked());
        copy.setWarnings(source.getWarnings() == null ? new ArrayList<>() : new ArrayList<>(source.getWarnings()));
        return copy;
    }

    private boolean sameUnitFamily(String family, String unitCode) {
        if (unitCode == null) return false;
        if ("mass".equals(family)) return "g".equalsIgnoreCase(unitCode) || "kg".equalsIgnoreCase(unitCode);
        if ("volume".equals(family)) return "ml".equalsIgnoreCase(unitCode) || "l".equalsIgnoreCase(unitCode);
        if ("count".equals(family)) return "count".equalsIgnoreCase(unitCode);
        return "unknown".equals(family);
    }

    private String sourceKey(Long dishId, Integer lineNo) {
        return dishId + ":" + lineNo;
    }

    private ShoppingList getOrCreateForUpdate(Long userId) {
        ShoppingList list = listMapper.findByUserIdForUpdate(userId);
        if (list != null) return list;
        list = new ShoppingList();
        list.setUserId(userId);
        list.setVersion(0L);
        list.setMetadataVersion(1);
        listMapper.insert(list);
        return list;
    }

    private void increment(ShoppingList list, Long userId) {
        long version = (list.getVersion() == null ? 0 : list.getVersion()) + 1;
        listMapper.updateVersion(list.getId(), userId, version, list.getMetadataVersion() == null ? 1 : list.getMetadataVersion());
    }

    private void checkVersion(ShoppingList list, Long expected) {
        requireVersion(expected);
        if (!expected.equals(list.getVersion())) throw new VersionConflictException(list.getVersion());
    }

    private void requireVersion(Long expected) {
        if (expected == null || expected < 0) throw new IllegalArgumentException("缺少有效的清单版本");
    }

    private ShoppingListResponse emptyResponse() { return new ShoppingListResponse(); }

    private ShoppingPreviewItemDTO first(List<ShoppingPreviewItemDTO> items) {
        return items == null || items.isEmpty() ? null : items.get(0);
    }

    private ShoppingItem toEntity(ShoppingDish group, ShoppingPreviewItemDTO item) {
        ShoppingItem entity = new ShoppingItem();
        entity.setShoppingDishId(group.getId());
        entity.setSourceLineNo(item.getSourceLineNo());
        entity.setCanonicalName(item.getCanonicalName());
        entity.setDisplayName(item.getDisplayName());
        entity.setNormalizedVariant(item.getNormalizedVariant());
        entity.setQuantityValue(item.getQuantityValue());
        entity.setQuantityMin(item.getQuantityMin());
        entity.setQuantityMax(item.getQuantityMax());
        entity.setQuantityText(item.getQuantityText());
        entity.setUnitCode(item.getUnitCode());
        entity.setUnitFamily(item.getUnitFamily());
        entity.setSourceQuantityText(item.getSourceQuantityText());
        entity.setParseStatus(item.getParseStatus());
        // This marker fits the existing VARCHAR(24) and distinguishes new verified writes from inferred legacy bases.
        entity.setCalculationStatus("CALCULATED".equals(item.getCalculationStatus()) && Boolean.TRUE.equals(item.getServingsVerified())
                ? "CALCULATED_VERIFIED" : item.getCalculationStatus());
        entity.setChecked(item.isChecked());
        entity.setUserOverride(item.isUserOverride());
        return entity;
    }

    private ShoppingPreviewItemDTO toPreviewItem(ShoppingItem item, ShoppingDish group) {
        ShoppingPreviewItemDTO dto = new ShoppingPreviewItemDTO();
        dto.setId(item.getId());
        dto.setSourceQuantityText(item.getSourceQuantityText());
        dto.setClientKey("saved-" + item.getId());
        dto.setCanonicalName(item.getCanonicalName());
        dto.setDisplayName(item.getDisplayName());
        dto.setNormalizedVariant(item.getNormalizedVariant());
        dto.setQuantityValue(item.getQuantityValue());
        dto.setQuantityMin(item.getQuantityMin());
        dto.setQuantityMax(item.getQuantityMax());
        dto.setQuantityText(item.getQuantityText());
        dto.setUnitCode(item.getUnitCode());
        dto.setUnitFamily(item.getUnitFamily());
        dto.setSourceDishId(group.getDishId());
        dto.setSourceDishName(group.getDishName());
        dto.setSourceLineNo(item.getSourceLineNo());
        dto.setSourceQuantityText(item.getSourceQuantityText());
        dto.setParseStatus(item.getParseStatus());
        dto.setCalculationStatus(item.getCalculationStatus());
        dto.setChecked(Boolean.TRUE.equals(item.getChecked()));
        dto.setUserOverride(Boolean.TRUE.equals(item.getUserOverride()));
        if ("CALCULATED_VERIFIED".equals(item.getCalculationStatus())) {
            dto.setCalculationStatus("CALCULATED");
            dto.setServingsVerified(true);
        } else if ("CALCULATED".equals(item.getCalculationStatus()) && !dto.isUserOverride()) {
            // Legacy rows did not persist the servings basis. A current catalog lookup cannot prove that historical basis.
            dto.setCalculationStatus("NEEDS_ADJUSTMENT");
            dto.setQuantityValue(null); dto.setQuantityMin(null); dto.setQuantityMax(null);
            dto.setQuantityText(item.getSourceQuantityText() == null || item.getSourceQuantityText().trim().isEmpty()
                    ? item.getQuantityText() : item.getSourceQuantityText());
            dto.getWarnings().add("历史原始份数未核验，请确认原量后使用");
        } else if ("NEEDS_ADJUSTMENT".equals(item.getCalculationStatus()) && !dto.isUserOverride()) {
            dto.setQuantityValue(null); dto.setQuantityMin(null); dto.setQuantityMax(null);
            dto.getWarnings().add("原始数量或份数需要核对");
        }
        return dto;
    }

    private PurchaseSummaryDTO buildSummary(List<ShoppingDishDTO> dishes) {
        Map<String, PurchaseSummaryItemDTO> mergeable = new LinkedHashMap<>();
        List<PurchaseSummaryItemDTO> separate = new ArrayList<>();
        for (ShoppingDishDTO dish : dishes) {
            for (ShoppingPreviewItemDTO item : dish.getItems()) {
                if (!isSafe(item)) {
                    separate.add(summaryItem(item, dish.getDishName()));
                    continue;
                }
                String key = item.getCanonicalName() + "|" + item.getUnitFamily() + "|" + item.getUnitCode() + "|" + item.getNormalizedVariant();
                PurchaseSummaryItemDTO summary = mergeable.get(key);
                if (summary == null) {
                    summary = summaryItem(item, dish.getDishName());
                    mergeable.put(key, summary);
                } else {
                    summary.add(item.getQuantityValue(), dish.getDishName());
                }
            }
        }
        return new PurchaseSummaryDTO(new ArrayList<>(mergeable.values()), separate);
    }

    private PurchaseSummaryItemDTO summaryItem(ShoppingPreviewItemDTO item, String dishName) {
        PurchaseSummaryItemDTO summary = new PurchaseSummaryItemDTO();
        summary.setCanonicalName(item.getCanonicalName());
        summary.setDisplayName(item.getDisplayName());
        summary.setUnitCode(item.getUnitCode());
        summary.setUnitFamily(item.getUnitFamily());
        summary.add(item.getQuantityValue(), dishName);
        if (!isSafe(item)) summary.setQuantityText(item.getQuantityText());
        return summary;
    }

    private boolean isSafe(ShoppingPreviewItemDTO item) {
        return item.getQuantityValue() != null && !item.isUserOverride()
                && "CALCULATED".equals(item.getCalculationStatus()) && Boolean.TRUE.equals(item.getServingsVerified())
                && "PARSED".equals(item.getParseStatus())
                && ("mass".equals(item.getUnitFamily()) || "volume".equals(item.getUnitFamily()) || "count".equals(item.getUnitFamily()));
    }

    private void calculateCounts(ShoppingListResponse response, List<ShoppingItem> items) {
        int checked = 0;
        for (ShoppingItem item : items) if (Boolean.TRUE.equals(item.getChecked())) checked++;
        response.setCheckedCount(checked);
        response.setPendingCount(Math.max(0, items.size() - checked));
    }

    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) { super(message); }
    }

    public static class VersionConflictException extends RuntimeException {
        private final Long serverVersion;
        public VersionConflictException(Long serverVersion) { super("购物清单已在其他设备更新"); this.serverVersion = serverVersion; }
        public Long getServerVersion() { return serverVersion; }
    }
}
