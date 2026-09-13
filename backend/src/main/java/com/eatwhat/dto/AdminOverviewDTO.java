package com.eatwhat.dto;

import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
public class AdminOverviewDTO {
    private final long totalUsers;
    private final long activeUsers;
    private final long disabledUsers;
    private final long systemDishes;
    private final long customDishes;
    private final long todayNewUsers;
    private final long todayNewDishes;
    private final List<AdminAuditLogDTO> recentAudits;

    public AdminOverviewDTO(long totalUsers, long activeUsers, long disabledUsers,
                            long systemDishes, long customDishes,
                            long todayNewUsers, long todayNewDishes,
                            List<AdminAuditLogDTO> recentAudits) {
        this.totalUsers = totalUsers;
        this.activeUsers = activeUsers;
        this.disabledUsers = disabledUsers;
        this.systemDishes = systemDishes;
        this.customDishes = customDishes;
        this.todayNewUsers = todayNewUsers;
        this.todayNewDishes = todayNewDishes;
        this.recentAudits = recentAudits == null ? Collections.emptyList() : recentAudits;
    }
}
