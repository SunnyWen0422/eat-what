package com.eatwhat.dto;

import java.util.*;

/** Durable Java execution receipt. A generated suggestion is never an executed result. */
public class ControlledToolTask {
    public String id;
    public String requestId;
    public String status = "awaiting_confirmation";
    public String previewToken;
    public long expiresAt;
    public boolean confirmed;
    public boolean retryable = true;
    public String summary;
    public String message;
    public String errorCode;
    public List<Step> steps = new ArrayList<>();
    public Map<String,Object> report;

    public static class Step {
        public String tool;
        public Map<String,Object> arguments = new LinkedHashMap<>();
        public Map<String,Object> binding = new LinkedHashMap<>();
        public String contentHash;
        public String status = "pending";
        public Map<String,Object> result;
    }
}
