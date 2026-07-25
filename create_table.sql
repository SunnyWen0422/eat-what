-- ============================================
-- 吃什么小程序 - 数据库建表 SQL
-- 数据库名：food
-- 表名：food
-- 生成时间：2026-04-29
-- ============================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS food
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE food;

-- 删除旧表（如需保留数据请先备份）
DROP TABLE IF EXISTS food;

-- 创建菜品表
CREATE TABLE food (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  name                      VARCHAR(255)    NOT NULL,
  type                      VARCHAR(50)     NOT NULL,
  cl                        TEXT,
  fl                        TEXT,
  step                      TEXT,
  tags                      VARCHAR(500)    DEFAULT ''      COMMENT '标签，逗号分隔',
  image                     VARCHAR(500)    DEFAULT ''      COMMENT '菜品图片URL',
  difficulty                VARCHAR(20)     DEFAULT ''      COMMENT '难度：简单/普通/困难',
  cook_time                 VARCHAR(50)     DEFAULT ''      COMMENT '烹饪时间',
  ingredients_amounts       TEXT                     COMMENT '食材与用量',
  steps                     TEXT                     COMMENT '详细步骤',
  step_images               TEXT                     COMMENT '步骤图片URL，JSON数组',
  tips                      TEXT                     COMMENT '小贴士',
  methods                   VARCHAR(200)    DEFAULT ''      COMMENT '烹饪方法',
  kcal                      INT             DEFAULT 0      COMMENT '热量（千卡）',
  cuisine_code              VARCHAR(32)     DEFAULT NULL   COMMENT '稳定菜系编码',
  tag_codes                 VARCHAR(500)    DEFAULT ''     COMMENT '稳定标签编码，逗号分隔',
  cook_minutes              INT             DEFAULT NULL   COMMENT '标准化烹饪分钟数',
  metadata_version          INT             NOT NULL DEFAULT 1 COMMENT '推荐元数据版本',
  is_custom                 TINYINT(1)      DEFAULT 0      COMMENT '是否为用户自定义菜品',
  user_id                   BIGINT          DEFAULT NULL   COMMENT '自定义菜品所属用户ID',
  create_time               DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci
  COMMENT='菜品数据表';

-- 创建索引
CREATE INDEX idx_type       ON food(type);
CREATE INDEX idx_difficulty ON food(difficulty);
CREATE INDEX idx_kcal      ON food(kcal);
CREATE INDEX idx_user_id   ON food(user_id);
CREATE INDEX idx_food_cuisine_code ON food(cuisine_code);
CREATE INDEX idx_food_cook_minutes ON food(cook_minutes);

CREATE TABLE IF NOT EXISTS user_preference (
  user_id                   BIGINT PRIMARY KEY,
  preferred_cuisines        JSON NOT NULL,
  preferred_tags            JSON NOT NULL,
  excluded_tags             JSON NOT NULL,
  excluded_ingredients      JSON NOT NULL,
  avoid_recent_days         INT NOT NULL DEFAULT 7,
  max_cook_minutes          INT DEFAULT NULL,
  version                   INT NOT NULL DEFAULT 1,
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 验证
DESC food;
SELECT COUNT(*) AS total_rows FROM food;
