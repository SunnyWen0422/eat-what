package com.eatwhat.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.*;

/** Server-only credentials. Never log or persist issued bearer URLs. */
@Service
public class VoiceSessionService {
    private final boolean enabled;
    private final String appId, secretId, secretKey;
    private final Clock clock = Clock.systemUTC();
    private final SecureRandom random = new SecureRandom();
    private final RequestRateLimiter minute = new RequestRateLimiter(6, 60000);
    private final RequestRateLimiter day = new RequestRateLimiter(100, 86400000);

    public VoiceSessionService(@Value("${TENCENT_ASR_ENABLED:false}") boolean enabled,
                               @Value("${TENCENT_ASR_APP_ID:}") String appId,
                               @Value("${TENCENT_ASR_SECRET_ID:}") String secretId,
                               @Value("${TENCENT_ASR_SECRET_KEY:}") String secretKey) {
        this.enabled = enabled; this.appId = appId; this.secretId = secretId; this.secretKey = secretKey;
    }

    public synchronized Map<String, Object> issue(Long userId) {
        if (userId == null || userId <= 0) throw new VoiceException(401, "VOICE_LOGIN_REQUIRED");
        if (!enabled || !appId.matches("[0-9]{5,20}") || !secretId.matches("[A-Za-z0-9]+") || secretKey.isEmpty())
            throw new VoiceException(503, "VOICE_NOT_CONFIGURED");
        String user = "user:" + userId;
        if (!minute.tryAcquire(user).isAllowed() || !day.tryAcquire(user).isAllowed()
                || !minute.tryAcquire("global", 60).isAllowed() || !day.tryAcquire("global", 5000).isAllowed())
            throw new VoiceException(429, "VOICE_RATE_LIMIT");
        long now = clock.instant().getEpochSecond();
        String voiceId = UUID.randomUUID().toString();
        SortedMap<String, String> params = new TreeMap<>();
        params.put("engine_model_type", "16k_zh");
        params.put("expired", Long.toString(now + 60));
        params.put("filter_dirty", "0"); params.put("filter_modal", "0"); params.put("filter_punc", "0");
        params.put("needvad", "1");
        params.put("nonce", Integer.toString(random.nextInt(Integer.MAX_VALUE - 1) + 1));
        params.put("secretid", secretId); params.put("timestamp", Long.toString(now));
        params.put("voice_format", "8"); params.put("voice_id", voiceId);
        StringJoiner query = new StringJoiner("&");
        params.forEach((key, value) -> query.add(key + "=" + value));
        String unsigned = "asr.cloud.tencent.com/asr/v2/" + appId + "?" + query;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("url", "wss://" + unsigned + "&signature=" + signature(unsigned, secretKey));
        result.put("voiceId", voiceId); result.put("expiresAt", (now + 60) * 1000);
        result.put("maxDurationMs", 30000); result.put("provider", "tencent-asr");
        return result;
    }

    static String signature(String unsigned, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return URLEncoder.encode(Base64.getEncoder().encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8))), "UTF-8");
        } catch (Exception e) { throw new VoiceException(503, "VOICE_SIGNING_FAILED"); }
    }

    public static class VoiceException extends RuntimeException {
        public final int status;
        public final String code;
        public VoiceException(int status, String code) { super(code); this.status = status; this.code = code; }
    }
}
