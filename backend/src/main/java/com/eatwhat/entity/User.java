package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.util.Date;

/**
 * 用户实体类
 */
@Data
public class User {
    
    @JsonProperty("id")
    private Long id;
    
    @JsonProperty("openId")
    private String openId;
    
    // sessionKey 不序列化到前端，避免泄露
    @JsonIgnore
    private String sessionKey;
    
    @JsonProperty("unionId")
    private String unionId;
    
    @JsonProperty("nickname")
    private String nickname;
    
    @JsonProperty("avatar")
    private String avatar;
    
    @JsonProperty("registerTime")
    private Date registerTime;
    
    @JsonProperty("lastLoginTime")
    private Date lastLoginTime;
    
    @JsonProperty("status")
    private Integer status; // 1-正常，0-禁用
}

