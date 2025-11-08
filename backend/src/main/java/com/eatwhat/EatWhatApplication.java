package com.eatwhat;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 吃什么小程序后端启动类
 */
@SpringBootApplication
@MapperScan("com.eatwhat.mapper")
public class EatWhatApplication {
    public static void main(String[] args) {
        SpringApplication.run(EatWhatApplication.class, args);
        System.out.println("\n========================================");
        System.out.println("✅ 吃什么小程序后端服务启动成功！");
        System.out.println("📡 API地址: http://localhost:8080/api");
        System.out.println("========================================\n");
    }
}

