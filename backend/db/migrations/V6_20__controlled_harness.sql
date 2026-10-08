-- Additive Java-owned preview, execution steps and restart-safe receipts.
-- Apply only after explicit migration approval against the selected database.
CREATE TABLE IF NOT EXISTS controlled_tool_task (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id BIGINT NOT NULL,
 request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 state_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_controlled_tool_request(user_id,request_id),
 KEY ix_controlled_tool_owner(user_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version,description,migration_fingerprint_sha256)
VALUES ('V6_20__controlled_harness','Java controlled tools and durable task receipts',SHA2('V6_20__controlled_harness:Java controlled tools and durable task receipts',256))
ON DUPLICATE KEY UPDATE version=VALUES(version);
