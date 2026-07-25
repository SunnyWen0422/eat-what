USE food;

-- utf8mb4_general_ci gives many CJK characters the same comparison weight.
-- BINARY comparisons are required here so canonical tags only match exact text.
UPDATE food
SET cuisine_code = CASE
        WHEN FIND_IN_SET(BINARY '川菜', BINARY tags) > 0 THEN 'SICHUAN'
        WHEN FIND_IN_SET(BINARY '粤菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '广东菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '潮汕菜', BINARY tags) > 0 THEN 'CANTONESE'
        WHEN FIND_IN_SET(BINARY '东北菜', BINARY tags) > 0 THEN 'NORTHEAST'
        WHEN FIND_IN_SET(BINARY '湘菜', BINARY tags) > 0 THEN 'HUNAN'
        WHEN FIND_IN_SET(BINARY '苏菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '淮扬菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '浙菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '上海菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '本帮菜', BINARY tags) > 0 THEN 'JIANGNAN'
        WHEN FIND_IN_SET(BINARY '鲁菜', BINARY tags) > 0 THEN 'SHANDONG'
        WHEN FIND_IN_SET(BINARY '闽菜', BINARY tags) > 0 THEN 'FUJIAN'
        WHEN FIND_IN_SET(BINARY '西北菜', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '新疆菜', BINARY tags) > 0 THEN 'NORTHWEST'
        ELSE NULL
    END,
    cook_minutes = CAST(NULLIF(REGEXP_SUBSTR(cook_time, '[0-9]+'), '') AS UNSIGNED),
    tag_codes = CONCAT_WS(',',
        IF(FIND_IN_SET(BINARY '家常菜', BINARY tags) > 0, 'HOME_STYLE', NULL),
        IF(FIND_IN_SET(BINARY '香辣', BINARY tags) > 0, 'SPICY', NULL),
        IF(FIND_IN_SET(BINARY '麻辣', BINARY tags) > 0, 'NUMB_SPICY', NULL),
        IF(FIND_IN_SET(BINARY '酸辣', BINARY tags) > 0, 'SOUR_SPICY', NULL),
        IF(FIND_IN_SET(BINARY '酸甜', BINARY tags) > 0, 'SWEET_SOUR', NULL),
        IF(FIND_IN_SET(BINARY '番茄味', BINARY tags) > 0, 'TOMATO', NULL),
        IF(FIND_IN_SET(BINARY '清淡', BINARY tags) > 0, 'LIGHT', NULL),
        IF(FIND_IN_SET(BINARY '懒人食谱', BINARY tags) > 0, 'LOW_EFFORT', NULL),
        IF(FIND_IN_SET(BINARY '素食', BINARY tags) > 0
          OR FIND_IN_SET(BINARY '素食主义', BINARY tags) > 0, 'VEGETARIAN', NULL),
        IF(FIND_IN_SET(BINARY '健康食谱', BINARY tags) > 0, 'HEALTHY', NULL),
        IF(FIND_IN_SET(BINARY '午餐', BINARY tags) > 0, 'LUNCH', NULL),
        IF(FIND_IN_SET(BINARY '晚餐', BINARY tags) > 0, 'DINNER', NULL),
        IF(FIND_IN_SET(BINARY '朋友聚餐', BINARY tags) > 0, 'GATHERING', NULL),
        IF(CAST(NULLIF(REGEXP_SUBSTR(cook_time, '[0-9]+'), '') AS UNSIGNED) <= 20, 'QUICK', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('蒸' AS BINARY), CAST('清蒸' AS BINARY)), 'STEAM', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('炒' AS BINARY), CAST('爆炒' AS BINARY), CAST('煸炒' AS BINARY)), 'STIR_FRY', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('烧' AS BINARY), CAST('红烧' AS BINARY), CAST('焖' AS BINARY)), 'BRAISE', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('炖' AS BINARY), CAST('煮' AS BINARY), CAST('煲' AS BINARY)), 'STEW', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('烤' AS BINARY), CAST('烘焙' AS BINARY)), 'BAKE', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('炸' AS BINARY), CAST('煎炸' AS BINARY)), 'FRY', NULL),
        IF(CAST(methods AS BINARY) IN (CAST('拌' AS BINARY), CAST('凉拌' AS BINARY)), 'COLD_MIX', NULL)
    ),
    metadata_version = 1
WHERE user_id IS NULL;
