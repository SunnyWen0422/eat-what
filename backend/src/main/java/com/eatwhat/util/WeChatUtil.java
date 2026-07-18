package com.eatwhat.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * 微信小程序工具类
 */
@Component
public class WeChatUtil {
    
    private static final String WECHAT_API_URL = "https://api.weixin.qq.com/sns/jscode2session";
    
    @Value("${wechat.miniapp.appid}")
    private String appId;
    
    @Value("${wechat.miniapp.secret}")
    private String appSecret;
    
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    
    public WeChatUtil() {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }
    
    /**
     * 通过 code 换取 openid 和 session_key
     * @param code 微信登录凭证
     * @return Map 包含 openid, session_key, unionid (如果存在)
     * @throws Exception 调用微信API失败时抛出异常
     */
    public Map<String, String> code2Session(String code) throws Exception {
        String url = String.format("%s?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
                WECHAT_API_URL, appId, appSecret, code);
        
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
        String responseBody = response.getBody();
        
        // 打印微信API的原始响应（用于调试）
        System.out.println("=== 微信API响应 ===");
        System.out.println("URL: " + url.replace(appSecret, "***"));
        System.out.println("Response Body: " + responseBody);
        System.out.println("=== 结束 ===");
        
        if (responseBody == null) {
            throw new RuntimeException("微信API返回数据为空");
        }
        
        JsonNode jsonNode = objectMapper.readTree(responseBody);
        
        // 检查是否有错误
        if (jsonNode.has("errcode") && jsonNode.get("errcode").asInt() != 0) {
            int errcode = jsonNode.get("errcode").asInt();
            String errmsg = jsonNode.has("errmsg") ? jsonNode.get("errmsg").asText() : "未知错误";
            throw new RuntimeException("微信API调用失败: " + errcode + " - " + errmsg);
        }
        
        Map<String, String> result = new HashMap<>();
        if (jsonNode.has("openid")) {
            result.put("openid", jsonNode.get("openid").asText());
        }
        if (jsonNode.has("session_key")) {
            result.put("session_key", jsonNode.get("session_key").asText());
        }
        if (jsonNode.has("unionid")) {
            result.put("unionid", jsonNode.get("unionid").asText());
        }
        
        return result;
    }
}
