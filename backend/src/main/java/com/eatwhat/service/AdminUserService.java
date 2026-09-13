package com.eatwhat.service;

import com.eatwhat.dto.AdminUserPageDTO;
import com.eatwhat.dto.AdminUserSummaryDTO;
import com.eatwhat.entity.User;
import com.eatwhat.mapper.UserMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AdminUserService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 50;

    private final UserMapper userMapper;

    public AdminUserService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public AdminUserPageDTO listUsers(String keyword, Integer page, Integer pageSize) {
        String normalizedKeyword = normalizeKeyword(keyword);
        int normalizedPage = page == null || page < 1 ? 1 : page;
        int normalizedPageSize = pageSize == null || pageSize < 1
                ? DEFAULT_PAGE_SIZE
                : Math.min(pageSize, MAX_PAGE_SIZE);

        int total = userMapper.countAdminUsers(normalizedKeyword);
        int maxPage = Math.max(1, (int) ((total + (long) normalizedPageSize - 1) / normalizedPageSize));
        normalizedPage = Math.min(normalizedPage, maxPage);
        int offset = (normalizedPage - 1) * normalizedPageSize;
        List<AdminUserSummaryDTO> users = userMapper.selectAdminUserPage(
                normalizedKeyword, normalizedPageSize, offset);
        return new AdminUserPageDTO(
                users, total, normalizedPage, normalizedPageSize, normalizedKeyword);
    }

    public User findUser(Long id) {
        return id == null ? null : userMapper.selectById(id);
    }

    public User updateStatus(Long id, Integer status) {
        if (id == null) throw new IllegalArgumentException("userId is required");
        if (status == null || (status != 0 && status != 1)) {
            throw new IllegalArgumentException("status must be 0 or 1");
        }
        User existing = findUser(id);
        if (existing == null) return null;
        if (existing.getStatus() != null && existing.getStatus().equals(status)) {
            throw new IllegalStateException("user status is unchanged");
        }
        if (userMapper.updateStatusIfChanged(id, status) == 0) {
            throw new IllegalStateException("user status update conflicted");
        }
        return findUser(id);
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null) return null;
        String value = keyword.trim();
        return value.isEmpty() ? null : value;
    }
}
