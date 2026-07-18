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
  id                        INT PRIMARY KEY,
  name                      VARCHAR(255)    DEFAULT '',
  type                      VARCHAR(255)    DEFAULT '',
  cl                        VARCHAR(255)    DEFAULT '',
  fl                        VARCHAR(255)    DEFAULT '',
  step                      VARCHAR(255)    DEFAULT '',
  tags                      VARCHAR(500)    DEFAULT ''      COMMENT '标签，逗号分隔',
  image                     VARCHAR(500)    DEFAULT ''      COMMENT '菜品图片URL',
  difficulty                VARCHAR(20)     DEFAULT ''      COMMENT '难度：简单/普通/困难',
  cook_time                 VARCHAR(50)     DEFAULT ''      COMMENT '烹饪时间',
  ingredients_amounts       TEXT                     COMMENT '食材与用量',
  steps                     TEXT                     COMMENT '详细步骤',
  step_images               TEXT                     COMMENT '步骤图片URL，JSON数组',
  tips                      TEXT                     COMMENT '小贴士',
  methods                   VARCHAR(200)    DEFAULT ''      COMMENT '烹饪方法',
  kcal                      INT             DEFAULT 0      COMMENT '热量（千卡）'
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci
  COMMENT='菜品数据表';

-- 创建索引
CREATE INDEX idx_type       ON food(type);
CREATE INDEX idx_difficulty ON food(difficulty);
CREATE INDEX idx_kcal      ON food(kcal);

-- 验证
DESC food;
SELECT COUNT(*) AS total_rows FROM food;
