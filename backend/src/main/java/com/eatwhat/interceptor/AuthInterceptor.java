package com.eatwhat.interceptor;

import com.eatwhat.util.TokenUtil;
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

    /**
     * 请求前认证
     */
    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        String uri = request.getRequestURI();

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

        if (token == null || token.isEmpty()) {
            writeUnauthorized(response, "未提供token");
            return false;
        }

        Long userId = TokenUtil.getUserIdFromToken(token);
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
        // 登录接口、静态资源等放行
        if (uri.startsWith("/users/login") || uri.startsWith("/api/users/login")) {
            return true;
        }
        // 其他公共接口按需在此扩展
        return false;
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

