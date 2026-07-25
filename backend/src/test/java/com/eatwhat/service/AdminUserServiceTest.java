package com.eatwhat.service;

import com.eatwhat.dto.AdminUserPageDTO;
import com.eatwhat.dto.AdminUserSummaryDTO;
import com.eatwhat.entity.User;
import com.eatwhat.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

    @Mock
    private UserMapper userMapper;
    private AdminUserService service;

    @BeforeEach
    void setUp() {
        service = new AdminUserService(userMapper);
    }

    @Test
    void listUsersTrimsKeywordAndCapsPageSize() {
        AdminUserSummaryDTO summary = new AdminUserSummaryDTO();
        summary.setId(9L);
        summary.setNickname("张三");
        when(userMapper.countAdminUsers("张三")).thenReturn(51);
        when(userMapper.selectAdminUserPage("张三", 50, 50))
                .thenReturn(Collections.singletonList(summary));

        AdminUserPageDTO result = service.listUsers("  张三  ", 2, 100);

        assertEquals(2, result.getPage());
        assertEquals(50, result.getPageSize());
        assertEquals(51, result.getTotal());
        assertEquals(9L, result.getList().get(0).getId());
        assertEquals(result.getList(), result.getData());
        assertTrue(result.isSuccess());
    }

    @Test
    void listUsersNormalizesInvalidPageAndBlankKeyword() {
        when(userMapper.countAdminUsers(null)).thenReturn(0);
        when(userMapper.selectAdminUserPage(null, 20, 0)).thenReturn(Collections.emptyList());

        AdminUserPageDTO result = service.listUsers("   ", 0, 0);

        assertEquals(1, result.getPage());
        assertEquals(20, result.getPageSize());
        assertNull(result.getKeyword());
    }

    @Test
    void listUsersClampsHugePageToLastAvailablePageBeforeCalculatingOffset() {
        when(userMapper.countAdminUsers(null)).thenReturn(21);
        when(userMapper.selectAdminUserPage(null, 20, 20)).thenReturn(Collections.emptyList());

        AdminUserPageDTO result = service.listUsers(null, Integer.MAX_VALUE, 20);

        assertEquals(2, result.getPage());
        assertEquals(21, result.getTotal());
        verify(userMapper).selectAdminUserPage(null, 20, 20);
    }

    @Test
    void findUserDelegatesToMapper() {
        User user = new User();
        user.setId(7L);
        when(userMapper.selectById(7L)).thenReturn(user);

        assertEquals(user, service.findUser(7L));
        verify(userMapper).selectById(7L);
    }
}
