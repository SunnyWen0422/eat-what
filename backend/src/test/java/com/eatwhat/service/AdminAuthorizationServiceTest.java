package com.eatwhat.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminAuthorizationServiceTest {

    @Test
    void configuredUserIdsAreAdminsAndOthersAreRejected() {
        AdminAuthorizationService service = new AdminAuthorizationService("7, 12,invalid");

        assertTrue(service.isAdmin(7L));
        assertTrue(service.isAdmin(12L));
        assertFalse(service.isAdmin(8L));
        assertFalse(service.isAdmin(null));
    }
}
