package com.eatwhat.dto;

import com.eatwhat.entity.AdminAuditLog;
import lombok.Data;

import java.util.Date;

@Data
public class AdminAuditLogDTO {
    private Long id;
    private Long adminUserId;
    private Long targetUserId;
    private Long targetDishId;
    private String action;
    private String result;
    private String detailJson;
    private String requestId;
    private Date createdAt;

    public static AdminAuditLogDTO from(AdminAuditLog source) {
        AdminAuditLogDTO dto = new AdminAuditLogDTO();
        dto.id = source.getId();
        dto.adminUserId = source.getAdminUserId();
        dto.targetUserId = source.getTargetUserId();
        dto.targetDishId = source.getTargetDishId();
        dto.action = source.getAction();
        dto.result = source.getResult();
        dto.detailJson = source.getDetailJson();
        dto.requestId = source.getRequestId();
        dto.createdAt = source.getCreatedAt();
        return dto;
    }
}
