-- 收藏菜品表
-- 记录用户收藏的菜品

CREATE TABLE IF NOT EXISTS favorite_dishes (
    ID BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    
    -- 用户ID
    USER_ID BIGINT NOT NULL COMMENT '用户ID，对应 users.id',
    
    -- 菜品ID
    DISH_ID BIGINT NOT NULL COMMENT '菜品ID，对应 food.id',
    
    -- 收藏时间
    CREATE_TIME DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
    
    -- 唯一约束：一个用户不能重复收藏同一道菜
    UNIQUE KEY uk_user_dish (USER_ID, DISH_ID),
    
    -- 索引
    INDEX idx_user_id (USER_ID),
    INDEX idx_dish_id (DISH_ID)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收藏菜品表';

-- 验证表创建成功
-- SELECT * FROM favorite_dishes LIMIT 1;
