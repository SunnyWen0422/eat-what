USE food;

DROP PROCEDURE IF EXISTS ensure_recommendation_preferences_schema;
DELIMITER //
CREATE PROCEDURE ensure_recommendation_preferences_schema()
BEGIN
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='food' AND column_name='cuisine_code') = 0 THEN
        ALTER TABLE food ADD COLUMN cuisine_code VARCHAR(32) NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='food' AND column_name='tag_codes') = 0 THEN
        ALTER TABLE food ADD COLUMN tag_codes VARCHAR(500) NOT NULL DEFAULT '';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='food' AND column_name='cook_minutes') = 0 THEN
        ALTER TABLE food ADD COLUMN cook_minutes INT NULL;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='food' AND column_name='metadata_version') = 0 THEN
        ALTER TABLE food ADD COLUMN metadata_version INT NOT NULL DEFAULT 1;
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='food' AND index_name='idx_food_cuisine_code') = 0 THEN
        CREATE INDEX idx_food_cuisine_code ON food(cuisine_code);
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='food' AND index_name='idx_food_cook_minutes') = 0 THEN
        CREATE INDEX idx_food_cook_minutes ON food(cook_minutes);
    END IF;
END//
DELIMITER ;
CALL ensure_recommendation_preferences_schema();
DROP PROCEDURE ensure_recommendation_preferences_schema;

CREATE TABLE IF NOT EXISTS user_preference (
    user_id BIGINT PRIMARY KEY,
    preferred_cuisines JSON NOT NULL,
    preferred_tags JSON NOT NULL,
    excluded_tags JSON NOT NULL,
    excluded_ingredients JSON NOT NULL,
    avoid_recent_days INT NOT NULL DEFAULT 7,
    max_cook_minutes INT NULL,
    version INT NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
