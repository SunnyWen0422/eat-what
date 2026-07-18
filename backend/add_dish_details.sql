-- 添加菜品详情字段到 recipe_records 表
-- 用于保存菜品的完整信息（名称、辅料、做法等）

-- 添加菜品详情JSON字段
ALTER TABLE recipe_records ADD COLUMN IF NOT EXISTS DISH_DETAILS TEXT COMMENT '菜品详情JSON数组，包含name, fl, step等';

-- 验证字段添加
-- SELECT ID, RECIPE_NAME, DISH_DETAILS FROM recipe_records LIMIT 5;
