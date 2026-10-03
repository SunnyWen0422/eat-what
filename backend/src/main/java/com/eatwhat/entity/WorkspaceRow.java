package com.eatwhat.entity;
import lombok.Data;
@Data
public class WorkspaceRow {
    private String id;
    private Long userId;
    private Long revision;
    private String stateJson;
}
