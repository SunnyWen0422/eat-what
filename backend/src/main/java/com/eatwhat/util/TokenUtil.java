package com.eatwhat.util;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Token工具类 - 简单的token管理
 * 注意：生产环境建议使用JWT或Redis存储token
 */
public class TokenUtil {
    
    // 存储 token -> userId 的映射 (内存存储，生产环境应使用Redis)
    private static final Map<String, Long> tokenMap = new ConcurrentHashMap<>();
    
    // 存储 userId -> token 的映射 (用于单点登录)
    private static final Map<Long, String> userTokenMap = new ConcurrentHashMap<>();
    
    // Token过期时间：30天（毫秒）
    private static final long TOKEN_EXPIRE_TIME = 30L * 24 * 60 * 60 * 1000;
    
    // Token过期时间记录
    private static final Map<String, Long> tokenExpireMap = new ConcurrentHashMap<>();
    
    /**
     * 生成token
     * @param userId 用户ID
     * @return token字符串
     */
    public static String generateToken(Long userId) {
        // 如果用户已有token，先移除旧的
        String oldToken = userTokenMap.get(userId);
        if (oldToken != null) {
            tokenMap.remove(oldToken);
            tokenExpireMap.remove(oldToken);
        }
        
        // 生成新token
        String token = UUID.randomUUID().toString().replace("-", "");
        long expireTime = System.currentTimeMillis() + TOKEN_EXPIRE_TIME;
        
        tokenMap.put(token, userId);
        userTokenMap.put(userId, token);
        tokenExpireMap.put(token, expireTime);
        
        return token;
    }
    
    /**
     * 验证token并获取用户ID
     * @param token token字符串
     * @return 用户ID，如果token无效返回null
     */
    public static Long getUserIdFromToken(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        
        // 检查token是否存在
        if (!tokenMap.containsKey(token)) {
            return null;
        }
        
        // 检查token是否过期
        Long expireTime = tokenExpireMap.get(token);
        if (expireTime != null && System.currentTimeMillis() > expireTime) {
            // token已过期，清理
            Long userId = tokenMap.remove(token);
            if (userId != null) {
                userTokenMap.remove(userId);
            }
            tokenExpireMap.remove(token);
            return null;
        }
        
        return tokenMap.get(token);
    }
    
    /**
     * 验证token是否有效
     * @param token token字符串
     * @return true表示有效，false表示无效
     */
    public static boolean validateToken(String token) {
        return getUserIdFromToken(token) != null;
    }
    
    /**
     * 移除token（登出时使用）
     * @param token token字符串
     */
    public static void removeToken(String token) {
        Long userId = tokenMap.remove(token);
        if (userId != null) {
            userTokenMap.remove(userId);
        }
        tokenExpireMap.remove(token);
    }
    
    /**
     * 根据用户ID移除token
     * @param userId 用户ID
     */
    public static void removeTokenByUserId(Long userId) {
        String token = userTokenMap.remove(userId);
        if (token != null) {
            tokenMap.remove(token);
            tokenExpireMap.remove(token);
        }
    }
}
