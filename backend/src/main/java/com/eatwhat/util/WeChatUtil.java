package com.eatwhat.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/** Minimal WeChat login client. Sensitive response fields are never logged. */
@Component
public class WeChatUtil {
    private static final Logger log = LoggerFactory.getLogger(WeChatUtil.class);
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

    public Map<String, String> code2Session(String code) throws Exception {
        String url = String.format("%s?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
                WECHAT_API_URL, appId, appSecret, code);

        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
        String responseBody = response.getBody();
        if (responseBody == null || responseBody.trim().isEmpty()) {
            throw new RuntimeException("微信API返回数据为空");
        }

        JsonNode jsonNode = objectMapper.readTree(responseBody);
        if (jsonNode.has("errcode") && jsonNode.get("errcode").asInt() != 0) {
            int errcode = jsonNode.get("errcode").asInt();
            String errmsg = jsonNode.has("errmsg") ? jsonNode.get("errmsg").asText() : "未知错误";
            log.warn("WeChat code2Session failed, errcode={}, errmsg={}", errcode, errmsg);
            throw new RuntimeException("微信API调用失败: " + errcode + " - " + errmsg);
        }

        Map<String, String> result = new HashMap<>();
        if (jsonNode.has("openid")) result.put("openid", jsonNode.get("openid").asText());
        if (jsonNode.has("session_key")) result.put("session_key", jsonNode.get("session_key").asText());
        if (jsonNode.has("unionid")) result.put("unionid", jsonNode.get("unionid").asText());
        return result;
    }
}
