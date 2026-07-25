package com.eatwhat.interceptor;

import com.eatwhat.service.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

class AuthInterceptorTest {

    private static final Long USER_ID = 77001L;
    private final TokenService tokenService = new TokenService("test-secret-with-sufficient-length", 3600000L);
    private final AuthInterceptor interceptor = new AuthInterceptor(tokenService);

    @Test
    void loginRouteIsPublic() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/users/login");
        assertTrue(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()));
    }

    @Test
    void protectedRouteWithoutTokenReturnsJson401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dishes");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(interceptor.preHandle(request, response, new Object()));
        assertEquals(401, response.getStatus());
        assertEquals("application/json;charset=UTF-8", response.getContentType());
        assertTrue(response.getContentAsString().contains("success"));
    }

    @Test
    void validBearerTokenAttachesCurrentUser() throws Exception {
        String token = tokenService.generateToken(USER_ID);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dishes");
        request.addHeader("Authorization", "Bearer " + token);

        assertTrue(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()));
        assertEquals(USER_ID, request.getAttribute("currentUserId"));
    }

    @Test
    void chatRouteAllowsGuestsButStillResolvesValidIdentity() throws Exception {
        MockHttpServletRequest guest = new MockHttpServletRequest("POST", "/chat/sync");
        assertTrue(interceptor.preHandle(guest, new MockHttpServletResponse(), new Object()));
        assertNull(guest.getAttribute("currentUserId"));

        String token = tokenService.generateToken(USER_ID);
        MockHttpServletRequest authenticated = new MockHttpServletRequest("POST", "/chat/sync");
        authenticated.addHeader("Authorization", "Bearer " + token);
        assertTrue(interceptor.preHandle(authenticated, new MockHttpServletResponse(), new Object()));
        assertEquals(USER_ID, authenticated.getAttribute("currentUserId"));
    }
}
