package com.eatwhat.service;

import com.eatwhat.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class UserAccessService {
    private final UserMapper userMapper;

    public UserAccessService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public boolean isActive(Long userId) {
        if (userId == null) return false;
        Integer status = userMapper.selectStatusById(userId);
        return status != null && status == 1;
    }
}
