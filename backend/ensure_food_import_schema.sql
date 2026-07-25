-- Prepare the food table for repeatable system-dish imports.
-- Compatible with MySQL 8.0 releases that do not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

USE food;

DROP PROCEDURE IF EXISTS ensure_food_import_schema;
DELIMITER //

CREATE PROCEDURE ensure_food_import_schema()
BEGIN
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'cl') = 0 THEN
        ALTER TABLE food ADD COLUMN cl TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'fl') = 0 THEN
        ALTER TABLE food ADD COLUMN fl TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'step') = 0 THEN
        ALTER TABLE food ADD COLUMN step TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'tags') = 0 THEN
        ALTER TABLE food ADD COLUMN tags VARCHAR(500) DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'image') = 0 THEN
        ALTER TABLE food ADD COLUMN image VARCHAR(500) DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'difficulty') = 0 THEN
        ALTER TABLE food ADD COLUMN difficulty VARCHAR(20) DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'cook_time') = 0 THEN
        ALTER TABLE food ADD COLUMN cook_time VARCHAR(50) DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'ingredients_amounts') = 0 THEN
        ALTER TABLE food ADD COLUMN ingredients_amounts TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'steps') = 0 THEN
        ALTER TABLE food ADD COLUMN steps LONGTEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'step_images') = 0 THEN
        ALTER TABLE food ADD COLUMN step_images TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'tips') = 0 THEN
        ALTER TABLE food ADD COLUMN tips TEXT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'methods') = 0 THEN
        ALTER TABLE food ADD COLUMN methods VARCHAR(200) DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'kcal') = 0 THEN
        ALTER TABLE food ADD COLUMN kcal INT DEFAULT 0;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'is_custom') = 0 THEN
        ALTER TABLE food ADD COLUMN is_custom TINYINT(1) DEFAULT 0;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'user_id') = 0 THEN
        ALTER TABLE food ADD COLUMN user_id BIGINT DEFAULT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'create_time') = 0 THEN
        ALTER TABLE food ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'cuisine_code') = 0 THEN
        ALTER TABLE food ADD COLUMN cuisine_code VARCHAR(32) DEFAULT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'tag_codes') = 0 THEN
        ALTER TABLE food ADD COLUMN tag_codes VARCHAR(500) NOT NULL DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'cook_minutes') = 0 THEN
        ALTER TABLE food ADD COLUMN cook_minutes INT DEFAULT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'metadata_version') = 0 THEN
        ALTER TABLE food ADD COLUMN metadata_version INT NOT NULL DEFAULT 1;
    END IF;

    ALTER TABLE food
        MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT,
        MODIFY COLUMN name VARCHAR(255) NOT NULL,
        MODIFY COLUMN type VARCHAR(50) NOT NULL;

    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_type') = 0 THEN
        CREATE INDEX idx_food_type ON food(type);
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_user_id') = 0 THEN
        CREATE INDEX idx_food_user_id ON food(user_id);
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_cuisine_code') = 0 THEN
        CREATE INDEX idx_food_cuisine_code ON food(cuisine_code);
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_cook_minutes') = 0 THEN
        CREATE INDEX idx_food_cook_minutes ON food(cook_minutes);
    END IF;
END//

DELIMITER ;
CALL ensure_food_import_schema();
DROP PROCEDURE ensure_food_import_schema;
COMMIT;
