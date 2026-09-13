package com.eatwhat.service;

import com.eatwhat.dto.AdminAuditLogDTO;
import com.eatwhat.dto.AdminAuditPageDTO;
import com.eatwhat.entity.AdminAuditLog;
import com.eatwhat.mapper.AdminAuditLogMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AdminAuditService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final Map<String, Boolean> DETAIL_KEYS;

    static {
        Map<String, Boolean> keys = new LinkedHashMap<>();
        keys.put("status", true);
        keys.put("dishName", true);
        keys.put("scope", true);
        keys.put("reason", true);
        keys.put("changedFields", true);
        DETAIL_KEYS = Collections.unmodifiableMap(keys);
    }

    private final AdminAuditLogMapper mapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AdminAuditService(AdminAuditLogMapper mapper) {
        this.mapper = mapper;
    }

    public void record(Long adminUserId, Long targetUserId, Long targetDishId,
                       String action, String result, String detailKey,
                       Object detailValue, String requestId) {
        if (adminUserId == null) throw new IllegalArgumentException("adminUserId is required");
        if (action == null || action.trim().isEmpty()) throw new IllegalArgumentException("audit action is required");
        if (result == null || result.trim().isEmpty()) throw new IllegalArgumentException("audit result is required");
        Map<String, Object> detail = new LinkedHashMap<>();
        if (detailKey != null && DETAIL_KEYS.containsKey(detailKey)) detail.put(detailKey, detailValue);
        AdminAuditLog log = new AdminAuditLog();
        log.setAdminUserId(adminUserId);
        log.setTargetUserId(targetUserId);
        log.setTargetDishId(targetDishId);
        log.setAction(action.trim());
        log.setResult(result.trim());
        log.setRequestId(requestId);
        try {
            log.setDetailJson(objectMapper.writeValueAsString(detail));
        } catch (JsonProcessingException e) {
            log.setDetailJson("{}");
        }
        mapper.insert(log);
    }

    public AdminAuditPageDTO search(Long adminId, Long targetUserId, String action,
                                    String from, String to, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safePageSize = pageSize == null || pageSize < 1 ? 20 : Math.min(pageSize, MAX_PAGE_SIZE);
        String safeFrom = normalizeDate(from, "from");
        String safeTo = normalizeDate(to, "to");
        if (safeFrom != null && safeTo != null && safeFrom.compareTo(safeTo) > 0) {
            throw new IllegalArgumentException("from must not be after to");
        }
        String safeAction = action == null || action.trim().isEmpty() ? null : action.trim();
        int total = mapper.count(adminId, targetUserId, safeAction, safeFrom, safeTo);
        int maxPage = Math.max(1, (int) ((total + (long) safePageSize - 1) / safePageSize));
        safePage = Math.min(safePage, maxPage);
        List<AdminAuditLogDTO> list = mapper.selectPage(adminId, targetUserId, safeAction,
                        safeFrom, safeTo, safePageSize, (safePage - 1) * safePageSize)
                .stream().map(AdminAuditLogDTO::from).collect(Collectors.toList());
        return new AdminAuditPageDTO(list, total, safePage, safePageSize);
    }

    private String normalizeDate(String value, String field) {
        if (value == null || value.trim().isEmpty()) return null;
        String normalized = value.trim();
        try {
            LocalDate.parse(normalized);
            return normalized;
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(field + " must use yyyy-MM-dd");
        }
    }
}
