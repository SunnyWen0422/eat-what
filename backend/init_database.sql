-- ========================================
-- 吃什么小程序数据库初始化脚本
-- 数据库: food
-- ========================================

USE food;

-- ========================================
-- 第一步：备份现有数据（如果表已存在）
-- ========================================
DROP TABLE IF EXISTS `food_backup`;
CREATE TABLE IF NOT EXISTS `food_backup` AS SELECT * FROM `food`;

-- ========================================
-- 第二步：修改food表结构（添加必要字段）
-- ========================================

-- 检查并添加TYPE字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'TYPE') = 0,
    'ALTER TABLE `food` ADD COLUMN `TYPE` varchar(20) DEFAULT ''meat'' COMMENT ''类型: meat/veg/soup''',
    'SELECT ''TYPE字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- 检查并添加PROTEIN字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'PROTEIN') = 0,
    'ALTER TABLE `food` ADD COLUMN `PROTEIN` int DEFAULT 10 COMMENT ''蛋白质含量(克)''',
    'SELECT ''PROTEIN字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- 检查并添加TAGS字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'TAGS') = 0,
    'ALTER TABLE `food` ADD COLUMN `TAGS` varchar(200) DEFAULT ''家常'' COMMENT ''标签,逗号分隔''',
    'SELECT ''TAGS字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- 检查并添加IS_CUSTOM字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'IS_CUSTOM') = 0,
    'ALTER TABLE `food` ADD COLUMN `IS_CUSTOM` tinyint DEFAULT 0 COMMENT ''0-系统菜品,1-用户自定义''',
    'SELECT ''IS_CUSTOM字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- 检查并添加USER_ID字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'USER_ID') = 0,
    'ALTER TABLE `food` ADD COLUMN `USER_ID` bigint DEFAULT NULL COMMENT ''用户ID''',
    'SELECT ''USER_ID字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- 检查并添加CREATE_TIME字段
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE table_schema = 'food' AND table_name = 'food' AND column_name = 'CREATE_TIME') = 0,
    'ALTER TABLE `food` ADD COLUMN `CREATE_TIME` datetime DEFAULT CURRENT_TIMESTAMP',
    'SELECT ''CREATE_TIME字段已存在'' as msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;

-- ========================================
-- 第三步：添加索引
-- ========================================
ALTER TABLE `food` ADD INDEX IF NOT EXISTS idx_type (`TYPE`);
ALTER TABLE `food` ADD INDEX IF NOT EXISTS idx_name (`NAME`);

-- ========================================
-- 第四步：智能分类现有数据
-- ========================================

-- 识别汤类
UPDATE `food` SET `TYPE` = 'soup' 
WHERE `NAME` LIKE '%汤%' OR `NAME` LIKE '%羹%' OR `NAME` LIKE '%煲%';

-- 识别荤菜
UPDATE `food` SET `TYPE` = 'meat' 
WHERE `TYPE` != 'soup' AND (
    `NAME` LIKE '%肉%' OR `NAME` LIKE '%鸡%' OR `NAME` LIKE '%鸭%' OR 
    `NAME` LIKE '%鱼%' OR `NAME` LIKE '%虾%' OR `NAME` LIKE '%蟹%' OR
    `NAME` LIKE '%排骨%' OR `NAME` LIKE '%牛%' OR `NAME` LIKE '%羊%' OR 
    `NAME` LIKE '%猪%' OR `NAME` LIKE '%蛋%' OR `NAME` LIKE '%鹅%'
);

-- 其余为素菜
UPDATE `food` SET `TYPE` = 'veg' WHERE `TYPE` = 'meat';

-- ========================================
-- 第五步：估算蛋白质含量
-- ========================================
UPDATE `food` SET `PROTEIN` = ROUND(IFNULL(`CALORIE`, 200) * 0.15 / 4) 
WHERE `PROTEIN` IS NULL OR `PROTEIN` = 0;

-- ========================================
-- 第六步：创建用户表
-- ========================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `open_id` varchar(100) UNIQUE NOT NULL COMMENT '微信openId',
  `nickname` varchar(50) COMMENT '昵称',
  `avatar` varchar(200) COMMENT '头像URL',
  `register_time` datetime DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_openid (`open_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ========================================
-- 第七步：创建用户菜谱表
-- ========================================
CREATE TABLE IF NOT EXISTS `custom_recipes` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '菜谱名称',
  `people` int NOT NULL COMMENT '适用人数',
  `user_id` bigint NOT NULL COMMENT '用户ID',
  `dish_ids` text COMMENT '菜品ID列表(JSON格式)',
  `meal_type` varchar(20) DEFAULT 'lunch' COMMENT '餐次类型',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户菜谱表';

-- ========================================
-- 第八步：导入默认菜品数据
-- ========================================
INSERT INTO `food` (`NAME`, `TYPE`, `CALORIE`, `PROTEIN`, `TAGS`, `IS_CUSTOM`) VALUES
('清炒西兰花', 'veg', 120, 5, '素,清淡', 0),
('凉拌黄瓜', 'veg', 80, 3, '素,清淡', 0),
('红烧鸡翅', 'meat', 320, 25, '荤,家常', 0),
('番茄炒蛋', 'meat', 220, 14, '荤,家常', 0),
('宫保鸡丁', 'meat', 360, 28, '荤,川味', 0),
('鱼香肉丝', 'meat', 340, 24, '荤,川味', 0),
('回锅肉', 'meat', 380, 22, '荤,川味', 0),
('麻婆豆腐', 'meat', 180, 12, '荤,川味', 0),
('糖醋排骨', 'meat', 320, 25, '荤,家常', 0),
('可乐鸡翅', 'meat', 280, 23, '荤,家常', 0),
('蒜蓉菠菜', 'veg', 100, 4, '素,清淡', 0),
('清炒豆芽', 'veg', 60, 3, '素,清淡', 0),
('干煸四季豆', 'veg', 140, 6, '素,川味', 0),
('拍黄瓜', 'veg', 70, 2, '素,清淡', 0),
('醋溜白菜', 'veg', 90, 4, '素,家常', 0),
('紫菜蛋花汤', 'soup', 60, 6, '汤,清淡', 0),
('西红柿牛腩汤', 'soup', 190, 16, '汤,家常', 0),
('玉米排骨汤', 'soup', 210, 18, '汤,滋补', 0),
('冬瓜排骨汤', 'soup', 180, 15, '汤,清淡', 0),
('西湖牛肉羹', 'soup', 120, 12, '汤,家常', 0)
ON DUPLICATE KEY UPDATE `NAME`=`NAME`;

-- ========================================
-- 第九步：插入测试用户（可选）
-- ========================================
INSERT INTO `users` (`open_id`, `nickname`, `avatar`) VALUES
('test_user_001', '测试用户', 'https://via.placeholder.com/100')
ON DUPLICATE KEY UPDATE `nickname`=`nickname`;

-- ========================================
-- 验证数据
-- ========================================
SELECT '========== 数据统计 ==========' as '';
SELECT `TYPE` as 菜品类型, COUNT(*) as 数量 FROM `food` GROUP BY `TYPE`;

SELECT '========== 示例数据 ==========' as '';
SELECT `ID`, `NAME`, `TYPE`, `CALORIE`, `PROTEIN`, `TAGS` FROM `food` LIMIT 10;

SELECT '========== 初始化完成 ==========' as '';
SELECT '✅ 数据库初始化成功！' as 状态;

