# MySQL数据库接入方案

## 数据库连接信息
```yaml
主机: 127.0.0.1
端口: 3306
数据库名: food
用户名: root
密码: Sunny418
表名: food
```

## 现有表结构
```sql
CREATE TABLE `food` (
  `ID` int NOT NULL,
  `NAME` varchar(255) DEFAULT NULL,
  `METERIAL` varchar(255) DEFAULT NULL,
  `CALORIE` int DEFAULT NULL,
  `STEP` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

## 方案选择

### 🔧 方案A：扩展现有表（推荐）
**优点**：保留现有数据，只添加必要字段  
**缺点**：需要修改表结构

#### 步骤1：添加必要字段
```sql
-- 添加小程序需要的字段
ALTER TABLE `food` 
  ADD COLUMN `TYPE` varchar(20) DEFAULT 'meat' COMMENT '类型: meat/veg/soup',
  ADD COLUMN `PROTEIN` int DEFAULT 10 COMMENT '蛋白质含量(克)',
  ADD COLUMN `TAGS` varchar(200) DEFAULT '家常' COMMENT '标签,逗号分隔',
  ADD COLUMN `IS_CUSTOM` tinyint DEFAULT 0 COMMENT '0-系统菜品,1-用户自定义',
  ADD COLUMN `USER_ID` bigint DEFAULT NULL COMMENT '用户ID',
  ADD COLUMN `CREATE_TIME` datetime DEFAULT CURRENT_TIMESTAMP;

-- 添加索引提升查询性能
ALTER TABLE `food`
  ADD INDEX idx_type (`TYPE`),
  ADD INDEX idx_name (`NAME`);
```

#### 步骤2：更新现有数据（示例）
```sql
-- 根据菜品名称智能分类
UPDATE `food` SET `TYPE` = 'meat' WHERE `NAME` LIKE '%肉%' OR `NAME` LIKE '%鸡%' OR `NAME` LIKE '%鱼%' OR `NAME` LIKE '%排骨%';
UPDATE `food` SET `TYPE` = 'veg' WHERE `NAME` LIKE '%菜%' OR `NAME` LIKE '%瓜%' OR `NAME` LIKE '%豆%';
UPDATE `food` SET `TYPE` = 'soup' WHERE `NAME` LIKE '%汤%' OR `NAME` LIKE '%羹%';

-- 根据卡路里估算蛋白质（简单公式）
UPDATE `food` SET `PROTEIN` = ROUND(`CALORIE` * 0.15 / 4) WHERE `PROTEIN` IS NULL;
```

---

### 🆕 方案B：创建新的关系表（标准化）
**优点**：数据结构清晰，便于扩展  
**缺点**：需要创建新表并迁移数据

#### 创建新表
```sql
-- 菜品表（与小程序完全兼容）
CREATE TABLE `dishes` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '菜品名称',
  `type` varchar(20) NOT NULL COMMENT '类型: meat/veg/soup',
  `calories` int DEFAULT 0 COMMENT '热量(千卡)',
  `protein` int DEFAULT 0 COMMENT '蛋白质(克)',
  `material` varchar(500) COMMENT '食材',
  `steps` text COMMENT '做法步骤',
  `tags` varchar(200) COMMENT '标签,逗号分隔',
  `is_custom` tinyint DEFAULT 0 COMMENT '0-系统,1-自定义',
  `user_id` bigint COMMENT '用户ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (`type`),
  INDEX idx_name (`name`),
  INDEX idx_user (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户表
CREATE TABLE `users` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `open_id` varchar(100) UNIQUE NOT NULL COMMENT '微信openId',
  `nickname` varchar(50),
  `avatar` varchar(200),
  `register_time` datetime DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_openid (`open_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户菜谱表
CREATE TABLE `custom_recipes` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '菜谱名称',
  `people` int NOT NULL COMMENT '适用人数',
  `user_id` bigint NOT NULL,
  `dish_ids` text COMMENT '菜品ID列表(JSON)',
  `meal_type` varchar(20) DEFAULT 'lunch',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 迁移现有数据
```sql
-- 从food表导入到dishes表
INSERT INTO `dishes` (`name`, `calories`, `material`, `steps`, `type`, `protein`, `tags`)
SELECT 
  `NAME`,
  `CALORIE`,
  `METERIAL`,
  `STEP`,
  CASE 
    WHEN `NAME` LIKE '%肉%' OR `NAME` LIKE '%鸡%' OR `NAME` LIKE '%鱼%' THEN 'meat'
    WHEN `NAME` LIKE '%汤%' OR `NAME` LIKE '%羹%' THEN 'soup'
    ELSE 'veg'
  END as type,
  ROUND(`CALORIE` * 0.15 / 4) as protein,
  '家常' as tags
FROM `food`;
```

---

## 📝 推荐方案：方案A（快速接入）

选择方案A的理由：
1. ✅ 不影响现有数据
2. ✅ 改动最小，风险低
3. ✅ 可以立即使用
4. ✅ 后续可升级到方案B

## 🚀 实施步骤

### 第一步：执行SQL脚本
在MySQL Workbench中执行以下脚本：

```sql
-- 1. 备份现有数据（重要！）
CREATE TABLE `food_backup` AS SELECT * FROM `food`;

-- 2. 添加新字段
ALTER TABLE `food` 
  ADD COLUMN `TYPE` varchar(20) DEFAULT 'meat' COMMENT '类型: meat/veg/soup',
  ADD COLUMN `PROTEIN` int DEFAULT 10 COMMENT '蛋白质含量(克)',
  ADD COLUMN `TAGS` varchar(200) DEFAULT '家常' COMMENT '标签,逗号分隔',
  ADD COLUMN `IS_CUSTOM` tinyint DEFAULT 0 COMMENT '0-系统菜品,1-用户自定义',
  ADD COLUMN `USER_ID` bigint DEFAULT NULL COMMENT '用户ID',
  ADD COLUMN `CREATE_TIME` datetime DEFAULT CURRENT_TIMESTAMP;

-- 3. 添加索引
ALTER TABLE `food`
  ADD INDEX idx_type (`TYPE`),
  ADD INDEX idx_name (`NAME`);

-- 4. 智能分类现有数据
UPDATE `food` SET `TYPE` = 'soup' WHERE `NAME` LIKE '%汤%' OR `NAME` LIKE '%羹%';
UPDATE `food` SET `TYPE` = 'meat' WHERE `TYPE` != 'soup' AND (`NAME` LIKE '%肉%' OR `NAME` LIKE '%鸡%' OR `NAME` LIKE '%鱼%' OR `NAME` LIKE '%排骨%' OR `NAME` LIKE '%牛%' OR `NAME` LIKE '%羊%' OR `NAME` LIKE '%猪%' OR `NAME` LIKE '%蛋%');
UPDATE `food` SET `TYPE` = 'veg' WHERE `TYPE` = 'meat';

-- 5. 估算蛋白质含量
UPDATE `food` SET `PROTEIN` = ROUND(IFNULL(`CALORIE`, 200) * 0.15 / 4);

-- 6. 验证数据
SELECT `TYPE`, COUNT(*) as count FROM `food` GROUP BY `TYPE`;
```

### 第二步：创建用户相关表
```sql
-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `open_id` varchar(100) UNIQUE NOT NULL,
  `nickname` varchar(50),
  `avatar` varchar(200),
  `register_time` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户菜谱表
CREATE TABLE IF NOT EXISTS `custom_recipes` (
  `id` bigint PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `people` int NOT NULL,
  `user_id` bigint NOT NULL,
  `dish_ids` text,
  `meal_type` varchar(20) DEFAULT 'lunch',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 第三步：导入默认菜品（可选）
```sql
-- 导入小程序默认菜品到数据库
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
```

## ✅ 验证数据
执行以下查询验证数据完整性：
```sql
-- 查看各类型菜品数量
SELECT `TYPE`, COUNT(*) as 数量 FROM `food` GROUP BY `TYPE`;

-- 查看示例数据
SELECT * FROM `food` LIMIT 10;

-- 检查必要字段
SELECT COUNT(*) FROM `food` WHERE `TYPE` IS NULL OR `CALORIE` IS NULL;
```

## 下一步
数据库准备完成后，继续配置后端服务。

