-- 数据库迁移脚本
-- 创建必要的表结构
-- 执行时间: 2026-01-04

-- ========================================
-- 用户表（users）- 微信小程序登录支持
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    open_id VARCHAR(128) UNIQUE NOT NULL COMMENT '微信openId，用户唯一标识',
    session_key VARCHAR(128) COMMENT '微信会话密钥，用于解密敏感数据',
    union_id VARCHAR(128) COMMENT '微信unionId，跨平台统一标识（可选）',
    nickname VARCHAR(64) COMMENT '用户昵称',
    avatar VARCHAR(255) COMMENT '用户头像URL',
    register_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    last_login_time DATETIME COMMENT '最后登录时间',
    status TINYINT DEFAULT 1 COMMENT '用户状态：1-正常，0-禁用',
    
    INDEX idx_open_id (open_id),
    INDEX idx_union_id (union_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 如果表已存在，添加新字段（用于升级）
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS session_key VARCHAR(128) COMMENT '微信会话密钥';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS union_id VARCHAR(128) COMMENT '微信unionId';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_time DATETIME COMMENT '最后登录时间';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS status TINYINT DEFAULT 1 COMMENT '用户状态';

-- ========================================
-- 菜品表结构优化（可选）
-- ========================================
-- ALTER TABLE food ADD COLUMN TAGS VARCHAR(500) DEFAULT '' COMMENT '菜品标签，逗号分隔';
-- ALTER TABLE food ADD COLUMN IS_CUSTOM TINYINT(1) DEFAULT 0 COMMENT '是否为自定义菜品：0-系统，1-用户自定义';
-- ALTER TABLE food ADD COLUMN USER_ID BIGINT DEFAULT NULL COMMENT '用户ID，自定义菜品时使用';
-- ALTER TABLE food ADD COLUMN CREATE_TIME DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- ========================================
-- 菜谱记录表（共享表，按用户隔离数据）
-- 所有用户的日历菜谱记录存放在同一张表中，通过 USER_ID + RECORD_DATE + MEAL_TYPE 区分
-- ========================================
CREATE TABLE IF NOT EXISTS recipe_records (
    ID BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

    -- 用户维度：实现“共享表 + 用户数据独立”
    USER_ID BIGINT NOT NULL COMMENT '用户ID，对应 users.id',

    -- 日期 + 餐次：唯一定位一餐
    RECORD_DATE DATE NOT NULL COMMENT '记录日期，YYYY-MM-DD',
    MEAL_TYPE VARCHAR(20) NOT NULL COMMENT '餐次类型：breakfast/lunch/dinner',

    -- 菜谱信息
    RECIPE_NAME VARCHAR(200) NOT NULL COMMENT '菜谱名称',
    DISH_IDS TEXT COMMENT '菜品ID列表，JSON格式字符串，如 [1,2,3]',
    IS_MANUAL TINYINT(1) DEFAULT 0 COMMENT '是否手动输入：0-推荐菜谱，1-手动输入',

    -- 元数据
    CREATE_TIME DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UPDATE_TIME DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 索引与唯一约束
    UNIQUE KEY uk_user_date_meal (USER_ID, RECORD_DATE, MEAL_TYPE),
    INDEX idx_user_date (USER_ID, RECORD_DATE),
    INDEX idx_user_meal (USER_ID, MEAL_TYPE),
    INDEX idx_date (RECORD_DATE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户日历菜谱记录表（共享表）';

-- ========================================
-- 初始化数据（可选）
-- ========================================
-- 插入一些测试数据
-- INSERT INTO recipe_records (USER_ID, RECORD_DATE, MEAL_TYPE, RECIPE_NAME, DISH_IDS, IS_MANUAL)
-- VALUES (1, '2026-01-04', 'lunch', '测试午餐', '[1,2,3]', 0);

COMMIT;

-- ========================================
-- 验证表创建
-- ========================================
-- 执行以下命令验证表是否创建成功：
--
-- mysql -u root -pSunny418 -e "USE food; SHOW TABLES LIKE 'recipe_records';"
-- mysql -u root -pSunny418 -e "USE food; DESCRIBE recipe_records;"
-- mysql -u root -pSunny418 -e "USE food; SELECT COUNT(*) FROM recipe_records;"

-- ========================================
-- 测试数据（可选）
-- ========================================
-- 插入测试数据验证功能：
-- INSERT INTO recipe_records (USER_ID, RECORD_DATE, MEAL_TYPE, RECIPE_NAME, DISH_IDS, IS_MANUAL)
-- VALUES (1, '2026-01-04', 'lunch', '测试午餐', '[1,2,3]', 0);
