package com.eatwhat.entity;

import lombok.Data;

import java.util.Date;

@Data
public class AdminAuditLog {
    private Long id;
    private Long adminUserId;
    private Long targetUserId;
    private Long targetDishId;
    private String action;
    private String result;
    private String detailJson;
    private String requestId;
    private Date createdAt;
}
