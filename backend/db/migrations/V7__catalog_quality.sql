-- Additive evidence records. Raw food and historical snapshots remain intact.
CREATE TABLE IF NOT EXISTS dish_quality_profile (
 dish_id INT NOT NULL PRIMARY KEY,
 dataset_version VARCHAR(80) NOT NULL,
 source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 review_status VARCHAR(24) NOT NULL,
 profile_json JSON NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_quality_review(review_status,dish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS dish_quality_revision (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 dish_id INT NOT NULL,
 dataset_version VARCHAR(80) NOT NULL,
 source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 profile_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_quality_history(dish_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO schema_migrations(version,description,migration_fingerprint_sha256)
VALUES ('V7__catalog_quality','Independent recipe evidence and immutable quality revisions',SHA2('V7__catalog_quality:Independent recipe evidence and immutable quality revisions',256))
ON DUPLICATE KEY UPDATE version=VALUES(version);
