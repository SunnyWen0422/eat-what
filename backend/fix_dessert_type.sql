-- ========================================
-- 甜品分类修正 SQL
-- 将数据库中误归类的甜品（type=soup/veg/meat）修正为 dessert
-- 执行前建议先 SELECT 预览影响范围
-- 生成时间: 2025-07-11
-- ========================================

USE food;

-- ========================================
-- Step 1: 预览将被修正的菜品（安全审查）
-- ========================================
SELECT id, name, type, tags
FROM food
WHERE type != 'dessert'
  AND (
    -- 甜品核心关键词
    name LIKE '%糊%' OR           -- 黑芝麻糊、杏仁糊、花生糊
    name LIKE '%糕%' OR           -- 马蹄糕、桂花糕、千层糕
    name LIKE '%酥%' OR           -- 蛋黄酥、核桃酥、榴莲酥
    name LIKE '%酪%' OR           -- 杏仁酪、奶酪
    name LIKE '%冻%' OR           -- 果冻、杏仁冻、椰汁冻
    name LIKE '%糖水%' OR         -- 红豆沙糖水、绿豆沙糖水
    name LIKE '%双皮奶%' OR       -- 双皮奶
    name LIKE '%姜撞奶%' OR       -- 姜撞奶
    name LIKE '%布丁%' OR         -- 布丁
    name LIKE '%班戟%' OR         -- 班戟
    name LIKE '%糯米糍%' OR       -- 糯米糍
    name LIKE '%大福%' OR         -- 雪媚娘大福
    name LIKE '%凉粉%' OR         -- 凉粉
    name LIKE '%冰粉%' OR         -- 冰粉
    name LIKE '%汤圆%' OR         -- 汤圆
    name LIKE '%元宵%' OR         -- 元宵
    name LIKE '%月饼%' OR         -- 月饼
    name LIKE '%蛋黄酥%' OR       -- 蛋黄酥
    name LIKE '%蛋挞%' OR         -- 蛋挞
    name LIKE '%泡芙%' OR         -- 泡芙
    name LIKE '%慕斯%' OR         -- 慕斯
    name LIKE '%提拉米苏%' OR     -- 提拉米苏
    name LIKE '%蛋糕%' OR         -- 蛋糕
    name LIKE '%面包%' OR         -- 面包（甜品类）
    name LIKE '%饼干%' OR         -- 饼干
    name LIKE '%曲奇%'            -- 曲奇
  )
  -- 排除明显不是甜品的（主菜类）
  AND name NOT LIKE '%糖醋%'
  AND name NOT LIKE '%排骨%'
  AND name NOT LIKE '%里脊%'
  AND name NOT LIKE '%糖拌%'
  AND name NOT LIKE '%糖渍%'
  AND name NOT LIKE '%奶香%'
  AND name NOT LIKE '%奶酪%'
  AND (name LIKE '%鱼%' AND name NOT LIKE '%鱼蛋%' AND name NOT LIKE '%鱼丸%') IS NOT TRUE
ORDER BY type, name;

-- ========================================
-- Step 2: 执行修正（取消注释后执行）
-- ========================================
/*
UPDATE food
SET type = 'dessert'
WHERE type != 'dessert'
  AND (
    name LIKE '%糊%' OR name LIKE '%糕%' OR name LIKE '%酥%' OR
    name LIKE '%酪%' OR name LIKE '%冻%' OR name LIKE '%糖水%' OR
    name LIKE '%双皮奶%' OR name LIKE '%姜撞奶%' OR name LIKE '%布丁%' OR
    name LIKE '%班戟%' OR name LIKE '%糯米糍%' OR name LIKE '%大福%' OR
    name LIKE '%凉粉%' OR name LIKE '%冰粉%' OR name LIKE '%汤圆%' OR
    name LIKE '%元宵%' OR name LIKE '%月饼%' OR name LIKE '%蛋黄酥%' OR
    name LIKE '%蛋挞%' OR name LIKE '%泡芙%' OR name LIKE '%慕斯%' OR
    name LIKE '%提拉米苏%' OR name LIKE '%蛋糕%' OR name LIKE '%面包%' OR
    name LIKE '%饼干%' OR name LIKE '%曲奇%'
  )
  AND name NOT LIKE '%糖醋%'
  AND name NOT LIKE '%排骨%'
  AND name NOT LIKE '%里脊%'
  AND name NOT LIKE '%糖拌%'
  AND name NOT LIKE '%糖渍%'
  AND name NOT LIKE '%奶香%'
  AND name NOT LIKE '%奶酪%';

-- 查看修正结果
SELECT type, COUNT(*) as cnt FROM food GROUP BY type ORDER BY cnt DESC;
*/
