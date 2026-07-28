-- Production-safe schema migration.
-- Run with the target database selected, for example:
--   mysql --defaults-extra-file=/secure/client.cnf food < V1__production_hardening.sql
-- This file intentionally has no fixed database selection, destructive table deletion,
-- truncation, or data replacement.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    migration_fingerprint_sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$
CREATE PROCEDURE apply_v1_production_hardening()
BEGIN
    DECLARE users_exists INT DEFAULT 0;
    DECLARE food_exists INT DEFAULT 0;
    DECLARE has_status INT DEFAULT 0;
    DECLARE has_food_user_id INT DEFAULT 0;
    DECLARE has_food_is_custom INT DEFAULT 0;
    DECLARE has_users_status_idx INT DEFAULT 0;
    DECLARE has_food_owner_idx INT DEFAULT 0;

    SELECT COUNT(*) INTO users_exists FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'users';
    SELECT COUNT(*) INTO food_exists FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'food';
    IF users_exists = 0 OR food_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'V1 requires existing users and food tables';
    END IF;

    SELECT COUNT(*) INTO has_status FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'status';
    IF has_status = 0 THEN
        ALTER TABLE users ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '1 active, 0 disabled';
    END IF;

    SELECT COUNT(*) INTO has_food_user_id FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'user_id';
    IF has_food_user_id = 0 THEN
        ALTER TABLE food ADD COLUMN user_id BIGINT NULL COMMENT 'owner for custom dishes';
    END IF;

    SELECT COUNT(*) INTO has_food_is_custom FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'is_custom';
    IF has_food_is_custom = 0 THEN
        ALTER TABLE food ADD COLUMN is_custom TINYINT NOT NULL DEFAULT 0 COMMENT '1 custom dish';
    END IF;

    SELECT COUNT(*) INTO has_users_status_idx FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_users_status';
    IF has_users_status_idx = 0 THEN
        CREATE INDEX idx_users_status ON users(status);
    END IF;

    SELECT COUNT(*) INTO has_food_owner_idx FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_owner_custom';
    IF has_food_owner_idx = 0 THEN
        CREATE INDEX idx_food_owner_custom ON food(user_id, is_custom, id);
    END IF;

    INSERT INTO schema_migrations(version, description, migration_fingerprint_sha256)
    VALUES ('V1__production_hardening', 'security boundaries and ownership indexes',
            SHA2('V1__production_hardening:security boundaries and ownership indexes', 256))
    ON DUPLICATE KEY UPDATE version = VALUES(version);
END$$
DELIMITER ;

CALL apply_v1_production_hardening();
DROP PROCEDURE apply_v1_production_hardening;
