package com.eatwhat.controller;

import com.eatwhat.dto.AdminAuditPageDTO;
import com.eatwhat.dto.AdminDishPageDTO;
import com.eatwhat.dto.AdminOverviewDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.entity.User;
import com.eatwhat.service.AdminAuditService;
import com.eatwhat.service.AdminAuthorizationService;
import com.eatwhat.service.AdminDishService;
import com.eatwhat.service.AdminOverviewService;
import com.eatwhat.service.AdminUserService;
import com.eatwhat.service.CustomDishService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminConsoleBehaviorTest {
    private final AdminUserService users = mock(AdminUserService.class);
    private final CustomDishService customDishes = mock(CustomDishService.class);
    private final AdminAuthorizationService authorization = mock(AdminAuthorizationService.class);
    private final AdminOverviewService overview = mock(AdminOverviewService.class);
    private final AdminDishService dishes = mock(AdminDishService.class);
    private final AdminAuditService audits = mock(AdminAuditService.class);
    private MockHttpServletRequest request;
    private AdminController controller;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest();
        request.setAttribute("currentUserId", 7L);
        when(authorization.isAdmin(7L)).thenReturn(true);
        controller = new AdminController(users, customDishes, authorization, overview, dishes, audits);
    }

    @Test
    void overviewAndAuditRequireAdminAndReturnServicePayloads() {
        AdminOverviewDTO summary = new AdminOverviewDTO(1, 1, 0, 2, 3, 0, 1, Collections.emptyList());
        when(overview.getOverview()).thenReturn(summary);
        assertEquals(200, controller.overview(request).getStatusCodeValue());
        assertEquals(summary, controller.overview(request).getBody());

        AdminAuditPageDTO page = new AdminAuditPageDTO(Collections.emptyList(), 0, 1, 20);
        when(audits.search(null, null, null, null, null, 1, 20)).thenReturn(page);
        assertEquals(page, controller.auditLogs(null, null, null, null, null, 1, 20, request).getBody());
    }

    @Test
    void userStatusUpdateUsesRequestIdentityAndReturnsSafeUser() {
        User user = new User();
        user.setId(9L);
        user.setStatus(0);
        when(users.updateStatus(9L, 0)).thenReturn(user);
        Map<String, Object> body = new HashMap<>();
        body.put("status", 0);

        ResponseEntity<?> response = controller.updateUserStatus(9L, body, request);

        assertEquals(200, response.getStatusCodeValue());
        verify(audits).record(7L, 9L, null, "USER_STATUS_UPDATE", "SUCCESS", "status", 0, null);
    }

    @Test
    void dishListAndPublicationDelegateToAdminDishService() {
        AdminDishPageDTO page = new AdminDishPageDTO(Collections.emptyList(), 0, 1, 20);
        when(dishes.list("system", null, null, null, null, 1, 20)).thenReturn(page);
        assertEquals(page, controller.listDishes("system", null, null, null, null, 1, 20, request).getBody());

        Dish updated = new Dish();
        updated.setId(4L);
        updated.setName("updated");
        when(dishes.updatePublication(4L, 0)).thenReturn(updated);
        Map<String, Object> body = new HashMap<>();
        body.put("published", 0);

        assertEquals(200, controller.updateDishStatus(4L, body, request).getStatusCodeValue());
        verify(dishes).updatePublication(4L, 0);
        verify(audits).record(7L, null, 4L, "SYSTEM_DISH_PUBLICATION", "SUCCESS", "status", 0, null);
    }
}
