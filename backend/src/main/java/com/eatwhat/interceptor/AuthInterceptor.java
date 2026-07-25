package com.eatwhat.interceptor;

import com.eatwhat.service.TokenService;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

/**
 * 认证拦截器
 * 拦截需要登录的接口，从请求头中解析并校验 token。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final TokenService tokenService;

    public AuthInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    /**
     * 请求前认证
     */
    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && uri.startsWith(contextPath)) {
            uri = uri.substring(contextPath.length());
        }

        // 放行不需要登录的接口
        if (isExcluded(uri)) {
            return true;
        }

        // 从请求头获取 Authorization: Bearer xxx
        String authHeader = request.getHeader("Authorization");
        String token = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }

        if ((token == null || token.isEmpty()) && isOptionalAuth(uri)) {
            return true;
        }
        if (token == null || token.isEmpty()) {
            writeUnauthorized(response, "未提供token");
            return false;
        }

        Long userId = tokenService.getUserIdFromToken(token);
        if (userId == null) {
            writeUnauthorized(response, "token无效或已过期");
            return false;
        }

        // 将 userId 保存到请求属性，方便后续使用
        request.setAttribute("currentUserId", userId);
        return true;
    }

    /**
     * 是否为无需认证的路径
     */
    private boolean isExcluded(String uri) {
        return uri.startsWith("/users/login") || uri.startsWith("/users/phone-login");
    }

    private boolean isOptionalAuth(String uri) {
        return uri.equals("/chat") || uri.startsWith("/chat/");
    }

    /**
     * 返回 401 未认证响应
     */
    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json;charset=UTF-8");

        String body = "{\"success\":false,\"message\":\"" + message + "\"}";
        try (PrintWriter writer = response.getWriter()) {
            writer.write(body);
            writer.flush();
        }
    }
}

