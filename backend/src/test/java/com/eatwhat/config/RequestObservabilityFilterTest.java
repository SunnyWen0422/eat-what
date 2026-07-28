package com.eatwhat.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RequestObservabilityFilterTest {
    @Test
    void preservesSafeRequestIdAndReturnsItToCaller() throws Exception {
        RequestObservabilityFilter filter = new RequestObservabilityFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader(RequestObservabilityFilter.HEADER, "request-123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals("request-123", response.getHeader(RequestObservabilityFilter.HEADER));
    }

    @Test
    void replacesUnsafeRequestId() throws Exception {
        RequestObservabilityFilter filter = new RequestObservabilityFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader(RequestObservabilityFilter.HEADER, "bad value");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        String requestId = response.getHeader(RequestObservabilityFilter.HEADER);
        assertTrue(requestId != null && requestId.length() >= 8);
        assertTrue(requestId.matches("[A-Za-z0-9_-]+"));
    }
}
