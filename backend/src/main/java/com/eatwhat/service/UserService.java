package com.eatwhat.service;

import com.eatwhat.entity.User;
import com.eatwhat.mapper.UserMapper;
import com.eatwhat.util.TokenUtil;
import com.eatwhat.util.WeChatUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * 用户业务逻辑层
 */
@Service
public class UserService {
    
    @Autowired
    private UserMapper userMapper;
    
    @Autowired
    private WeChatUtil weChatUtil;
    
    /**
     * 通过微信code登录/注册
     * @param code 微信登录凭证
     * @return Map 包含 token 和 user，或者 needBind 标志
     */
    @Transactional
    public Map<String, Object> loginByCode(String code) {
        try {
            // 调用微信API获取openid和session_key
            Map<String, String> wechatResult = weChatUtil.code2Session(code);
            String openId = wechatResult.get("openid");
            String sessionKey = wechatResult.get("session_key");
            String unionId = wechatResult.get("unionid");
            
            if (openId == null || sessionKey == null) {
                throw new RuntimeException("微信API返回数据不完整");
            }
            
            // 根据openId查询用户
            User user = userMapper.selectByOpenId(openId);
            
            if (user == null) {
                // 新用户，创建账号
                user = new User();
                user.setOpenId(openId);
                user.setSessionKey(sessionKey);
                user.setUnionId(unionId);
                user.setStatus(1); // 正常状态
                user.setRegisterTime(new Date());
                
                userMapper.insert(user);
                
                // 生成token
                String token = TokenUtil.generateToken(user.getId());
                
                Map<String, Object> result = new HashMap<>();
                result.put("token", token);
                result.put("user", user);
                result.put("isNewUser", true);
                return result;
            } else {
                // 老用户，更新session_key和登录时间
                userMapper.updateSessionKey(openId, sessionKey);
                userMapper.updateLastLoginTime(user.getId());
                
                // 如果unionId不为空且数据库中没有，则更新
                if (unionId != null && (user.getUnionId() == null || user.getUnionId().isEmpty())) {
                    user.setUnionId(unionId);
                    userMapper.updateUserInfo(user);
                }
                
                // 重新查询用户信息（确保获取最新数据）
                user = userMapper.selectById(user.getId());
                user.setLastLoginTime(new Date());
                
                // 生成token
                String token = TokenUtil.generateToken(user.getId());
                
                Map<String, Object> result = new HashMap<>();
                result.put("token", token);
                result.put("user", user);
                result.put("isNewUser", false);
                return result;
            }
        } catch (Exception e) {
            throw new RuntimeException("登录失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 根据用户ID获取用户信息
     * @param userId 用户ID
     * @return 用户对象
     */
    public User getUserById(Long userId) {
        return userMapper.selectById(userId);
    }
    
    /**
     * 更新用户信息（昵称、头像等）
     * @param user 用户对象
     * @return 更新后的用户对象
     */
    @Transactional
    public User updateUserInfo(User user) {
        userMapper.updateUserInfo(user);
        return userMapper.selectById(user.getId());
    }
    
    /**
     * 更新session_key
     * @param openId 用户openId
     * @param sessionKey 新的session_key
     */
    @Transactional
    public void updateSessionKey(String openId, String sessionKey) {
        userMapper.updateSessionKey(openId, sessionKey);
    }
}
