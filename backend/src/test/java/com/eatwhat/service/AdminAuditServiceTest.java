package com.eatwhat.service;

import com.eatwhat.entity.AdminAuditLog;
import com.eatwhat.mapper.AdminAuditLogMapper;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AdminAuditServiceTest {
    @Test
    void recordPersistsSafeTargetAndRequestMetadata() {
        AdminAuditLogMapper mapper = mock(AdminAuditLogMapper.class);
        AdminAuditService service = new AdminAuditService(mapper);

        service.record(7L, 9L, 10L, "USER_STATUS_CHANGED", "SUCCESS",
                "status", "0", "request-123");

        verify(mapper).insert(any(AdminAuditLog.class));
    }
}
