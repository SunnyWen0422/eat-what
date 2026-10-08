-- Additive and reentrant. Keep menus, snapshots and receipts when rolling back the UI.
-- No migration is executed automatically; review and apply through the normal release procedure.
CREATE TABLE IF NOT EXISTS custom_recipes (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(255) NOT NULL,
 people INT NOT NULL DEFAULT 2,
 user_id BIGINT NOT NULL,
 dish_ids TEXT NOT NULL,
 meal_type VARCHAR(32) NULL,
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version BIGINT NOT NULL DEFAULT 1,
 is_deleted TINYINT NOT NULL DEFAULT 0,
 dish_snapshots_json MEDIUMTEXT NULL,
 KEY idx_personal_menu_owner(user_id,is_deleted,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$
CREATE PROCEDURE apply_v6_10_personal_menus()
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='custom_recipes' AND column_name='version') THEN
  ALTER TABLE custom_recipes ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='custom_recipes' AND column_name='is_deleted') THEN
  ALTER TABLE custom_recipes ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='custom_recipes' AND column_name='dish_snapshots_json') THEN
  ALTER TABLE custom_recipes ADD COLUMN dish_snapshots_json MEDIUMTEXT NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='custom_recipes' AND index_name='idx_personal_menu_owner') THEN
  CREATE INDEX idx_personal_menu_owner ON custom_recipes(user_id,is_deleted,id);
 END IF;
END$$
DELIMITER ;
CALL apply_v6_10_personal_menus();
DROP PROCEDURE apply_v6_10_personal_menus;

INSERT INTO schema_migrations(version,description,migration_fingerprint_sha256)
VALUES ('V6_10__personal_menus','Private reusable menu versions and recipe snapshots',SHA2('V6_10__personal_menus:Private reusable menu versions and recipe snapshots',256))
ON DUPLICATE KEY UPDATE version=VALUES(version);
