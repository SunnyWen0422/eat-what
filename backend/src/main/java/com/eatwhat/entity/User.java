package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
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
    
    @JsonProperty("nickname")
    private String nickname;
    
    @JsonProperty("avatar")
    private String avatar;
    
    @JsonProperty("registerTime")
    private Date registerTime;
}

