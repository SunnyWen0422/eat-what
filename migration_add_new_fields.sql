-- 数据库迁移脚本：为 food 表添加新字段
-- 执行日期：2026-04-29
-- 说明：此脚本用于扩展 food 表结构，支持新的数据字段

USE food;

-- 1. 添加 tags 字段（标签，逗号分隔）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS tags VARCHAR(500) DEFAULT '' COMMENT '标签，逗号分隔';

-- 2. 添加 image 字段（菜品图片URL）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS image VARCHAR(500) DEFAULT '' COMMENT '菜品图片URL';

-- 3. 添加 difficulty 字段（难度：简单/普通/困难）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT '' COMMENT '难度：简单/普通/困难';

-- 4. 添加 cook_time 字段（烹饪时间）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS cook_time VARCHAR(50) DEFAULT '' COMMENT '烹饪时间';

-- 5. 添加 ingredients_amounts 字段（食材与用量）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS ingredients_amounts TEXT COMMENT '食材与用量';

-- 6. 添加 steps 字段（详细步骤）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS steps TEXT COMMENT '详细步骤';

-- 7. 添加 step_images 字段（步骤图片URL，JSON数组格式）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS step_images TEXT COMMENT '步骤图片URL，JSON数组格式';

-- 8. 添加 tips 字段（小贴士）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS tips TEXT COMMENT '小贴士';

-- 9. 添加 methods 字段（烹饪方法）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS methods VARCHAR(200) DEFAULT '' COMMENT '烹饪方法';

-- 10. 添加 kcal 字段（热量，单位：千卡）
ALTER TABLE food 
ADD COLUMN IF NOT EXISTS kcal INT DEFAULT 0 COMMENT '热量（千卡）';

-- 11. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_type ON food(type);
CREATE INDEX IF NOT EXISTS idx_difficulty ON food(difficulty);
CREATE INDEX IF NOT EXISTS idx_kcal ON food(kcal);

-- 显示更新后的表结构
DESC food;

COMMIT;
