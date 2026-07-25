package com.eatwhat.dto;

import lombok.Data;

import java.util.Date;

@Data
public class AdminUserSummaryDTO {
    private Long id;
    private String nickname;
    private String avatar;
    private String phone;
    private Integer status;
    private Date registerTime;
    private Date lastLoginTime;
    private Integer customCount;
}
