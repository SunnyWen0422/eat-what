package com.eatwhat.entity;
import lombok.Data;
@Data
public class WorkspaceTask {
    @com.fasterxml.jackson.annotation.JsonIgnore
    private java.util.Date createdAt;
    private String id;
    private String workspaceId;
    private Long userId;
    private Long baseRevision;
    private String status;
    private String inputJson;
    private String resultJson;
    private String leaseToken;
}
