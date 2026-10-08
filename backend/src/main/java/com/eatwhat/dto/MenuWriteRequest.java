package com.eatwhat.dto;
import lombok.Data;
import java.util.*;
@Data
public class MenuWriteRequest {
    private String requestId;
    private Long expectedVersion;
    private String name;
    private Integer people;
    private List<Long> dishIds = new ArrayList<>();
    private Map<Long,String> dishVersions = new LinkedHashMap<>();
    private String date;
    private String mealType;
}
