package com.eatwhat.config;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Configuration
@EnableScheduling
public class MealWorkspaceConfig {
    @Bean public TransactionTemplate transactionTemplate(PlatformTransactionManager manager) {return new TransactionTemplate(manager);}
}
