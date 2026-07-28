package com.eatwhat.interceptor;

import com.eatwhat.service.TokenService;
import com.eatwhat.service.UserAccessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

/** Authentication boundary for protected API routes. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final TokenService tokenService;
    private final UserAccessService userAccessService;

    /** Test-only compatibility constructor; Spring uses the two-argument constructor. */
    public AuthInterceptor(TokenService tokenService) {
        this(tokenService, null);
    }

    @Autowired
    public AuthInterceptor(TokenService tokenService, UserAccessService userAccessService) {
        this.tokenService = tokenService;
        this.userAccessService = userAccessService;
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && uri.startsWith(contextPath)) {
            uri = uri.substring(contextPath.length());
        }

        if (isExcluded(uri)) return true;

        String authHeader = request.getHeader("Authorization");
        String token = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }

        if ((token == null || token.isEmpty()) && isOptionalAuth(uri)) return true;
        if (token == null || token.isEmpty()) {
            writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "未提供token");
            return false;
        }

        Long userId = tokenService.getUserIdFromToken(token);
        if (userId == null) {
            writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "token无效或已过期");
            return false;
        }

        if (userAccessService != null && !userAccessService.isActive(userId)) {
            writeJson(response, HttpServletResponse.SC_FORBIDDEN, "用户已被禁用");
            return false;
        }

        request.setAttribute("currentUserId", userId);
        return true;
    }

    private boolean isExcluded(String uri) {
        return uri.startsWith("/users/login") || uri.startsWith("/users/phone-login");
    }

    private boolean isOptionalAuth(String uri) {
        return uri.equals("/chat") || uri.startsWith("/chat/");
    }

    private void writeJson(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json;charset=UTF-8");
        try (PrintWriter writer = response.getWriter()) {
            writer.write("{\"success\":false,\"message\":\"" + message + "\"}");
            writer.flush();
        }
    }
}
