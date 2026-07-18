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
    }
}



