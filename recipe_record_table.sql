-- ============================================
-- 吃什么小程序 - 菜谱记录表建表 SQL
-- 数据库名：food
-- 表名：recipe_records
-- 功能：存储用户每日每餐的菜谱选择记录
-- 生成时间：2026-04-29
-- ============================================

USE food;

-- 删除旧表（如需保留数据请先备份）
DROP TABLE IF EXISTS recipe_records;

-- 创建菜谱记录表
CREATE TABLE recipe_records (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY  COMMENT '记录ID',
  user_id             BIGINT          NOT NULL            COMMENT '用户ID',
  record_date         DATE            NOT NULL            COMMENT '记录日期（不含时间）',
  meal_type           VARCHAR(20)     NOT NULL            COMMENT '餐次类型：breakfast/lunch/dinner',
  recipe_name         VARCHAR(255)   DEFAULT ''          COMMENT '菜谱名称',
  dish_ids            TEXT                             COMMENT '菜品ID列表（JSON数组）',
  dish_details        TEXT                             COMMENT '菜品详情（JSON数组，包含id/name/type/ingredientsAmounts/step）',
  is_manual          INT             DEFAULT 0          COMMENT '是否手动输入：0-推荐菜谱，1-手动输入',
  create_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time         DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  -- 唯一索引：同一用户同一天同一餐次只能有一条记录
  UNIQUE KEY uk_user_date_meal (user_id, record_date, meal_type),
  
  -- 普通索引：用于按用户和日期查询
  INDEX idx_user_date (user_id, record_date),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci
  COMMENT='用户菜谱记录表';

-- 验证
DESC recipe_records;
SELECT COUNT(*) AS total_rows FROM recipe_records;
