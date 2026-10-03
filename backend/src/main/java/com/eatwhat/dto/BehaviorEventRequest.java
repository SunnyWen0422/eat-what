package com.eatwhat.dto;
import lombok.Data;
@Data
public class BehaviorEventRequest {
    private String requestId;
    private String workspaceId;
    private Long expectedWorkspaceRevision;
    private Long planVersion;
    private String eventType;
}
