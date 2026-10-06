-- Additive, reentrant. Retain pricing and expense records during application rollback.
CREATE TABLE IF NOT EXISTS shopping_expense (
 list_id BIGINT NOT NULL,
 ingredient_key VARCHAR(2200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 amount DECIMAL(9,2) NOT NULL,
 channel VARCHAR(32) NULL,
 PRIMARY KEY(list_id,ingredient_key),
 CONSTRAINT fk_expense_list FOREIGN KEY(list_id) REFERENCES shopping_list(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_price_batch (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 source_url VARCHAR(1000) NOT NULL,
 quote_date DATE NOT NULL,
 content_hash CHAR(64) NOT NULL,
 raw_content MEDIUMBLOB NOT NULL,
 status VARCHAR(24) NOT NULL,
 audit_json MEDIUMTEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uk_price_batch(content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_price (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 batch_id BIGINT NOT NULL,
 source_name VARCHAR(120) NOT NULL,
 variant VARCHAR(255) NOT NULL DEFAULT '',
 price DECIMAL(12,4) NOT NULL,
 unit_quantity DECIMAL(12,4) NOT NULL,
 unit_code VARCHAR(16) NOT NULL,
 unit_family VARCHAR(16) NOT NULL,
 quote_date DATE NOT NULL,
 UNIQUE KEY uk_price_row(batch_id,source_name,variant),
 CONSTRAINT fk_price_batch FOREIGN KEY(batch_id) REFERENCES ingredient_price_batch(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_price_mapping (
 canonical_name VARCHAR(120) NOT NULL,
 variant VARCHAR(255) NOT NULL DEFAULT '',
 source_name VARCHAR(120) NOT NULL,
 source_variant VARCHAR(255) NOT NULL DEFAULT '',
 PRIMARY KEY(canonical_name,variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_price_collection (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 status VARCHAR(24) NOT NULL,
 message VARCHAR(1000) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations(version,description,migration_fingerprint_sha256)
VALUES ('V5__shopping_prices','Shanghai retail quotes and shopping expenses',SHA2('V5__shopping_prices:Shanghai retail quotes and shopping expenses',256))
ON DUPLICATE KEY UPDATE version=VALUES(version);
