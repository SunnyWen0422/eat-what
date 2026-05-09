package com.eatwhat.config;

import com.eatwhat.interceptor.AuthInterceptor;
import org.springframework.lang.NonNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * WebMvc 配置：注册认证拦截器等。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    @Autowired
    public WebMvcConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    @SuppressWarnings("null")
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns(
                        "/users/**",
                        "/dishes/**",
                        "/recipe-records/**",
                        "/favorites/**",
                        "/favorite-dishes/**",
                        "/shopping-list/**",
                        "/api/users/**",
                        "/api/dishes/**",
                        "/api/recipe-records/**",
                        "/api/favorites/**",
                        "/api/favorite-dishes/**",
                        "/api/shopping-list/**"
                )
                .excludePathPatterns(
                        "/users/login",
                        "/api/users/login"
                );
    }
}

