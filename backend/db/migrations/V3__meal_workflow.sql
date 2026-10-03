-- Additive migration. Invoke only against an explicitly selected test/production DB.
ALTER TABLE recipe_records ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN record_origin VARCHAR(16) NOT NULL DEFAULT 'legacy',
    ADD COLUMN target_people INT NOT NULL DEFAULT 2,
    ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE meal_consumption (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 meal_date DATE NOT NULL,
 meal_type VARCHAR(16) NOT NULL,
 status VARCHAR(16) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 1,
 source_record_id BIGINT NULL,
 planned_snapshot_json JSON NULL,
 actual_dishes_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_consumption(user_id,meal_date,meal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- No cascading FK to plans: deleting an arrangement must preserve actual meals.
CREATE TABLE meal_mutation_log (
 user_id BIGINT NOT NULL,
 request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 response_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE shopping_mutation_log (
 user_id BIGINT NOT NULL,
 request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 response_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE shopping_dish ADD COLUMN source_date DATE NULL,
 ADD COLUMN source_meal_type VARCHAR(16) NULL;

ALTER TABLE shopping_request_log ADD COLUMN request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
CREATE TABLE user_avatar (
 image_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 user_id BIGINT NOT NULL,
 image_bytes MEDIUMBLOB NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_avatar_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
