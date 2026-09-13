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
        ShoppingRequestLog existing = logMapper.findSuccess(userId, request.getRequestId());
        if (existing != null) {
            try {
                return new ShoppingSyncResponse(objectMapper.readValue(existing.getResponseJson(), ShoppingListResponse.class), true);
            } catch (Exception ignored) {
                // 历史快照损坏时继续按正常写入路径处理，避免阻塞用户。
            }
        }
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
                    group.setTargetPeople(request.getTargetPeople());
                    dishMapper.insert(group);
                }
                List<ShoppingPreviewItemDTO> merged = mergeService.mergeWithinDish(group.getId(), groupRequest.getItems());
                for (ShoppingPreviewItemDTO item : merged) {
                    ShoppingItem entity = toEntity(group, item);
                    ShoppingItem existingItem = itemMapper.findBySource(group.getId(), entity.getSourceLineNo());
                    if (existingItem == null) itemMapper.insert(entity);
                    else {
                        entity.setId(existingItem.getId());
                        itemMapper.update(entity, list.getId());
                    }
                }
            }
        }
        long nextVersion = (list.getVersion() == null ? 0 : list.getVersion()) + 1;
        listMapper.updateVersion(list.getId(), userId, nextVersion, list.getMetadataVersion() == null ? 1 : list.getMetadataVersion());
        ShoppingListResponse response = getList(userId, "all");
        try {
            logMapper.insertSuccess(userId, request.getRequestId(), objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            throw new IllegalStateException("保存请求日志失败", e);
        }
        return new ShoppingSyncResponse(response, false);
    }

    @Transactional
    public ShoppingListResponse patchItem(Long userId, Long itemId, ShoppingItemPatchRequest patch) {
        if (patch == null) throw new IllegalArgumentException("修改内容不能为空");
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
        if (patch.getDisplayName() != null) item.setDisplayName(patch.getDisplayName().trim());
        if (patch.getQuantityValue() != null) item.setQuantityValue(patch.getQuantityValue());
        if (patch.getQuantityText() != null) item.setQuantityText(patch.getQuantityText());
        if (patch.getUnitCode() != null) item.setUnitCode(patch.getUnitCode());
        item.setChecked(patch.getChecked());
        item.setUserOverride(patch.getUserOverride() == null ? Boolean.TRUE : patch.getUserOverride());
        itemMapper.update(item, list.getId());
        increment(list, userId);
        return getList(userId, "all");
    }

    @Transactional
    public ShoppingListResponse deleteItem(Long userId, Long itemId, Long expectedListVersion) {
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, expectedListVersion);
        if (itemMapper.delete(itemId, list.getId()) == 0) throw new NotFoundException("购物项目不存在");
        increment(list, userId);
        return getList(userId, "all");
    }

    @Transactional
    public ShoppingListResponse clear(Long userId, ShoppingClearRequest request) {
        RequestIdValidator.requireValid(request.getRequestId());
        ShoppingRequestLog existing = logMapper.findSuccess(userId, request.getRequestId());
        if (existing != null) {
            try {
                return objectMapper.readValue(existing.getResponseJson(), ShoppingListResponse.class);
            } catch (Exception ignored) {
                // 损坏的历史快照不阻断当前清空请求，继续执行正常事务。
            }
        }
        ShoppingList list = getOrCreateForUpdate(userId);
        checkVersion(list, request.getExpectedListVersion());
        if ("all".equalsIgnoreCase(request.getScope())) itemMapper.deleteAll(list.getId());
        else itemMapper.deleteChecked(list.getId());
        increment(list, userId);
        ShoppingListResponse response = getList(userId, "all");
        try {
            logMapper.insertSuccess(userId, request.getRequestId(), objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            throw new IllegalStateException("保存请求日志失败", e);
        }
        return response;
    }

    private List<ShoppingDishRequest> trustedDishes(Long userId, ShoppingBatchAddRequest request) {
        Set<Long> sourceDishIds = new HashSet<>();
        for (ShoppingDishRequest group : request.getDishes()) {
            if (group == null || group.getSelectionKey() == null || group.getSelectionKey().trim().isEmpty()) {
                throw new IllegalArgumentException("菜品分组缺少稳定标识");
            }
            if (group.getItems() == null || group.getItems().isEmpty()) continue;
            for (ShoppingPreviewItemDTO item : group.getItems()) {
                if (item == null || item.getSourceDishId() == null || item.getSourceLineNo() == null) {
                    throw new IllegalArgumentException("购物项目缺少来源菜品或来源行号");
                }
                sourceDishIds.add(item.getSourceDishId());
            }
        }
        if (sourceDishIds.isEmpty()) throw new IllegalArgumentException("至少需要一个有效食材项目");
        ShoppingPreviewRequest previewRequest = new ShoppingPreviewRequest();
        previewRequest.setDishIds(new ArrayList<>(sourceDishIds));
        previewRequest.setTargetPeople(request.getTargetPeople() == null ? new BigDecimal("2") : request.getTargetPeople());
        ShoppingPreviewResponse trusted = previewService.createPreview(userId, previewRequest);
        Map<String, ShoppingPreviewItemDTO> trustedItems = new HashMap<>();
        for (ShoppingDishDTO dish : trusted.getDishes()) {
            for (ShoppingPreviewItemDTO item : dish.getItems()) {
                trustedItems.put(sourceKey(item.getSourceDishId(), item.getSourceLineNo()), item);
            }
        }
        List<ShoppingDishRequest> normalized = new ArrayList<>();
        for (ShoppingDishRequest group : request.getDishes()) {
            ShoppingDishRequest copy = new ShoppingDishRequest();
            copy.setSelectionKey(group.getSelectionKey().trim());
            for (ShoppingPreviewItemDTO incoming : group.getItems()) {
                ShoppingPreviewItemDTO source = trustedItems.get(sourceKey(incoming.getSourceDishId(), incoming.getSourceLineNo()));
                if (source == null) throw new IllegalArgumentException("购物项目来源已失效，请重新预览");
                copy.getItems().add(mergeClientOverride(source, incoming));
            }
            normalized.add(copy);
        }
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
        if (expected != null && !expected.equals(list.getVersion())) throw new VersionConflictException(list.getVersion());
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
        entity.setCalculationStatus(item.getCalculationStatus());
        entity.setChecked(item.isChecked());
        entity.setUserOverride(item.isUserOverride());
        return entity;
    }

    private ShoppingPreviewItemDTO toPreviewItem(ShoppingItem item, ShoppingDish group) {
        ShoppingPreviewItemDTO dto = new ShoppingPreviewItemDTO();
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
                String key = item.getCanonicalName() + "|" + item.getUnitFamily() + "|" + item.getUnitCode();
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
        return summary;
    }

    private boolean isSafe(ShoppingPreviewItemDTO item) {
        return item.getQuantityValue() != null && !item.isUserOverride()
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
