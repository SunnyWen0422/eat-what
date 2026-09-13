package com.eatwhat.service;

import com.eatwhat.dto.AdminAuditPageDTO;
import com.eatwhat.dto.AdminOverviewDTO;
import com.eatwhat.mapper.AdminOverviewMapper;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;

@Service
public class AdminOverviewService {
    private final AdminOverviewMapper overviewMapper;
    private final AdminAuditService auditService;

    public AdminOverviewService(AdminOverviewMapper overviewMapper, AdminAuditService auditService) {
        this.overviewMapper = overviewMapper;
        this.auditService = auditService;
    }

    public AdminOverviewDTO getOverview() {
        Map<String, Object> values = overviewMapper.selectOverview();
        if (values == null) values = Collections.emptyMap();
        AdminAuditPageDTO audits = auditService.search(null, null, null, null, null, 1, 5);
        return new AdminOverviewDTO(
                number(values.get("totalUsers")), number(values.get("activeUsers")),
                number(values.get("disabledUsers")), number(values.get("systemDishes")),
                number(values.get("customDishes")), number(values.get("todayNewUsers")),
                number(values.get("todayNewDishes")), audits.getList());
    }

    private long number(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
