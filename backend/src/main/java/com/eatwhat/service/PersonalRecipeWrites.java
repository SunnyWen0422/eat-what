package com.eatwhat.service;

import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.util.RequestIdValidator;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/** Must run inside the caller's transaction; user row serializes all receipt-backed writes. */
final class PersonalRecipeWrites {
    private final MealConsumptionMapper logs;
    private final ObjectMapper json;
    PersonalRecipeWrites(MealConsumptionMapper logs,ObjectMapper json) { this.logs=logs; this.json=json; }
    String begin(Long user,String requestId,String operation,Object body) {
        RequestIdValidator.requireValid(requestId);
        if(user==null || logs.lockUser(user)==null) throw new IllegalArgumentException("用户不存在");
        return WorkflowRequestHash.sha256("personal-recipe|"+operation+"|"+encode(body));
    }
    <T> T replay(Long user,String requestId,String hash,Class<T> type) {
        Map<String,Object> previous=logs.request(user,requestId);
        if(previous==null)return null;
        if(!hash.equals(previous.get("requestHash")))throw new MealConsumptionService.VersionConflict("请求标识已用于不同内容，请重新读取");
        try { return json.readValue(String.valueOf(previous.get("responseJson")),type); }
        catch(java.io.IOException error) { throw new IllegalStateException("操作结果无法读取",error); }
    }
    void save(Long user,String requestId,String hash,Object result) { logs.log(user,requestId,hash,encode(result)); }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch(java.io.IOException error) { throw new IllegalStateException("操作内容无法保存",error); }
    }
}
