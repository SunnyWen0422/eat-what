-- Administrator workbench migration.
-- Run with the target database selected by the invoker.
-- This file is idempotent and never deletes business rows.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    migration_fingerprint_sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    admin_user_id BIGINT NOT NULL,
    target_user_id BIGINT NULL,
    target_dish_id BIGINT NULL,
    action VARCHAR(64) NOT NULL,
    result VARCHAR(16) NOT NULL,
    detail_json JSON NULL,
    request_id VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at, id),
    INDEX idx_audit_action (action, created_at),
    INDEX idx_audit_target_user (target_user_id, created_at),
    INDEX idx_audit_target_dish (target_dish_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$
CREATE PROCEDURE apply_v2_admin_console()
BEGIN
    DECLARE food_exists INT DEFAULT 0;
    DECLARE published_exists INT DEFAULT 0;
    DECLARE published_index_exists INT DEFAULT 0;

    SELECT COUNT(*) INTO food_exists FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'food';
    IF food_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'V2 requires existing food table';
    END IF;

    SELECT COUNT(*) INTO published_exists FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'food' AND column_name = 'is_published';
    IF published_exists = 0 THEN
        ALTER TABLE food ADD COLUMN is_published TINYINT NOT NULL DEFAULT 1 COMMENT '1 visible to recommendation';
    END IF;

    SELECT COUNT(*) INTO published_index_exists FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'food' AND index_name = 'idx_food_published';
    IF published_index_exists = 0 THEN
        CREATE INDEX idx_food_published ON food(is_published, user_id, id);
    END IF;

    INSERT INTO schema_migrations(version, description, migration_fingerprint_sha256)
    VALUES ('V2__admin_console', 'administrator workbench and audit storage',
            SHA2('V2__admin_console:administrator workbench and audit storage', 256))
    ON DUPLICATE KEY UPDATE version = VALUES(version);
END$$
DELIMITER ;

CALL apply_v2_admin_console();
DROP PROCEDURE apply_v2_admin_console;
