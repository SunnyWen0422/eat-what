-- Canonical runtime storage. Executed only by the owned local importer in this phase.
-- Existing food is archived before creating the derived, read-only food view.
CREATE TABLE catalog_recipe (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 owner_id BIGINT NULL,
 is_published TINYINT NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 document JSON NOT NULL,
 name VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(document,'$.name'))) STORED,
 category_code VARCHAR(80) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(document,'$.categoryCode'))) STORED,
 cuisine_code VARCHAR(80) GENERATED ALWAYS AS (NULLIF(JSON_UNQUOTE(JSON_EXTRACT(document,'$.cuisineCode')),'null')) STORED,
 cook_minutes INT GENERATED ALWAYS AS (CEIL(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(document,'$.timing.totalMinutes')),'null') AS DECIMAL(18,4)))) STORED,
 INDEX ix_catalog_owner(owner_id,is_published,id),
 INDEX ix_catalog_category(category_code,owner_id,is_published,id),
 INDEX ix_catalog_cuisine(cuisine_code,id),
 INDEX ix_catalog_name(name)
);
CREATE TABLE catalog_ingredient (id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY, document JSON NOT NULL);
CREATE TABLE catalog_metadata (id TINYINT PRIMARY KEY, document JSON NOT NULL, CHECK(id=1));
CREATE TABLE catalog_id_mapping (old_id BIGINT PRIMARY KEY, dish_id BIGINT NOT NULL, INDEX ix_catalog_target(dish_id));
CREATE TABLE catalog_retired_source (old_id BIGINT PRIMARY KEY, document JSON NOT NULL);

CREATE VIEW food AS SELECT
 r.id AS ID, r.document AS RECIPE_JSON,r.name AS NAME,
 CASE
 WHEN JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.categoryCode')) LIKE 'CAT_MEAT_%' THEN 'meat'
 WHEN JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.categoryCode')) LIKE 'CAT_VEGETABLE_%' THEN 'veg'
 WHEN JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.categoryCode')) LIKE 'CAT_SOUP_%' THEN 'soup'
 WHEN JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.categoryCode')) LIKE 'CAT_STAPLE_%' THEN 'staple'
 WHEN JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.categoryCode')) LIKE 'CAT_DESSERT_%' THEN 'dessert'
 END AS TYPE,
 (SELECT GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(i.document,'$.name')) ORDER BY m.ord SEPARATOR '、')
 FROM JSON_TABLE(r.document,'$.ingredients[*]' COLUMNS(ord FOR ORDINALITY,ingredient_id VARCHAR(128) PATH '$.ingredientId')) m
 JOIN catalog_ingredient i ON i.id=CONVERT(m.ingredient_id USING utf8mb4) COLLATE utf8mb4_bin) AS CL,
 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.baseServings')),'null') AS FL,
 (SELECT GROUP_CONCAT(s.txt ORDER BY s.ord SEPARATOR '###') FROM JSON_TABLE(r.document,'$.steps[*]' COLUMNS(ord FOR ORDINALITY,txt TEXT PATH '$.text')) s) AS STEP,
 (SELECT GROUP_CONCAT(s.txt ORDER BY s.ord SEPARATOR '###') FROM JSON_TABLE(r.document,'$.steps[*]' COLUMNS(ord FOR ORDINALITY,txt TEXT PATH '$.text')) s) AS STEPS,
 (SELECT GROUP_CONCAT(CONCAT(JSON_UNQUOTE(JSON_EXTRACT(i.document,'$.name')),'|',COALESCE(CAST(m.qty AS CHAR),'适量'),'|',m.unit,'|',m.role,'|',COALESCE(m.prep,'')) ORDER BY m.ord SEPARATOR '###')
 FROM JSON_TABLE(r.document,'$.ingredients[*]' COLUMNS(ord FOR ORDINALITY,ingredient_id VARCHAR(128) PATH '$.ingredientId',qty DECIMAL(18,8) PATH '$.quantity',unit VARCHAR(20) PATH '$.unit',role VARCHAR(30) PATH '$.role',prep TEXT PATH '$.preparation')) m
 JOIN catalog_ingredient i ON i.id=CONVERT(m.ingredient_id USING utf8mb4) COLLATE utf8mb4_bin) AS INGREDIENTS_AMOUNTS,
 r.cuisine_code AS CUISINE_CODE,
 (SELECT GROUP_CONCAT(DISTINCT t.code ORDER BY t.code SEPARATOR ',') FROM JSON_TABLE(JSON_MERGE_PRESERVE(
 JSON_EXTRACT(r.document,'$.mealCodes'),JSON_EXTRACT(r.document,'$.methodCodes'),JSON_EXTRACT(r.document,'$.sceneCodes'),
 JSON_EXTRACT(r.document,'$.operationCodes'),JSON_EXTRACT(r.document,'$.dietaryCodes'),JSON_EXTRACT(r.document,'$.allergenCodes'),
 JSON_EXTRACT(r.document,'$.flavor.baseCodes'),JSON_EXTRACT(r.document,'$.flavor.specialCodes')),'$[*]' COLUMNS(code VARCHAR(80) PATH '$')) t) AS TAG_CODES,
 r.cook_minutes AS COOK_MINUTES,
 CAST(r.cook_minutes AS CHAR) AS COOK_TIME,
 JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.imageUrl')) AS IMAGE,
 ROUND(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.document,'$.calculatedNutrition.perServing.energyKcal')),'null') AS DECIMAL(18,6))) AS KCAL,
 4 AS METADATA_VERSION,'' AS TAGS,'' AS TIPS,'' AS DIFFICULTY,'[]' AS STEP_IMAGES,
 CAST(JSON_EXTRACT(r.document,'$.methodCodes') AS CHAR) AS METHODS,
 r.owner_id AS user_id, IF(r.owner_id IS NULL,0,1) AS is_custom,r.is_published AS IS_PUBLISHED,r.created_at AS create_time
 FROM catalog_recipe r;
