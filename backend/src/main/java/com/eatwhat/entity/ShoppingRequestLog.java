package com.eatwhat.entity;

import lombok.Data;
import java.util.Date;

@Data
public class ShoppingRequestLog {
    private Long id;
    private Long userId;
    private String requestId;
    private String requestHash;
    private String responseJson;
    private String status;
    private Date createdAt;
}
