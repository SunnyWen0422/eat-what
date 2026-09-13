-- Shopping list schema. Execute only in an isolated database first.
CREATE TABLE IF NOT EXISTS ingredient_catalog (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  canonical_name VARCHAR(120) NOT NULL,
  aliases JSON NOT NULL,
  unit_family VARCHAR(16) NULL,
  default_unit VARCHAR(32) NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ingredient_catalog_name (canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dish_ingredient (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dish_id INT NOT NULL,
  sequence_no INT NOT NULL,
  source_text VARCHAR(500) NOT NULL,
  canonical_name VARCHAR(120) NULL,
  quantity_kind VARCHAR(16) NOT NULL,
  quantity_value DECIMAL(12,4) NULL,
  quantity_min DECIMAL(12,4) NULL,
  quantity_max DECIMAL(12,4) NULL,
  unit_code VARCHAR(32) NULL,
  unit_family VARCHAR(16) NULL,
  category VARCHAR(32) NULL,
  preparation VARCHAR(255) NULL,
  base_people DECIMAL(8,2) NULL,
  source_allowance_percent DECIMAL(6,2) NULL,
  parse_status VARCHAR(24) NOT NULL,
  parse_message VARCHAR(255) NULL,
  source_hash CHAR(64) NOT NULL,
  metadata_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dish_ingredient_sequence (dish_id, sequence_no),
  KEY idx_dish_ingredient_name (canonical_name),
  CONSTRAINT fk_dish_ingredient_dish FOREIGN KEY (dish_id) REFERENCES food(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_list (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  metadata_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shopping_list_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_dish (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shopping_list_id BIGINT NOT NULL,
  selection_key VARCHAR(120) NOT NULL,
  dish_id INT NULL,
  dish_name VARCHAR(255) NOT NULL,
  target_people DECIMAL(8,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shopping_dish_selection (shopping_list_id, selection_key),
  CONSTRAINT fk_shopping_dish_list FOREIGN KEY (shopping_list_id) REFERENCES shopping_list(id) ON DELETE CASCADE,
  CONSTRAINT fk_shopping_dish_food FOREIGN KEY (dish_id) REFERENCES food(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_item (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shopping_dish_id BIGINT NOT NULL,
  source_line_no INT NOT NULL,
  canonical_name VARCHAR(120) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  normalized_variant VARCHAR(255) NULL,
  quantity_value DECIMAL(12,4) NULL,
  quantity_min DECIMAL(12,4) NULL,
  quantity_max DECIMAL(12,4) NULL,
  quantity_text VARCHAR(255) NOT NULL,
  unit_code VARCHAR(32) NULL,
  unit_family VARCHAR(16) NULL,
  category VARCHAR(32) NULL,
  source_quantity_text VARCHAR(500) NULL,
  parse_status VARCHAR(24) NOT NULL,
  calculation_status VARCHAR(24) NOT NULL,
  checked TINYINT(1) NOT NULL DEFAULT 0,
  user_override TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_source (shopping_dish_id, source_line_no),
  KEY idx_shopping_item_checked (shopping_dish_id, checked),
  CONSTRAINT fk_shopping_item_dish FOREIGN KEY (shopping_dish_id) REFERENCES shopping_dish(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_request_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  request_id VARCHAR(80) NOT NULL,
  response_json JSON NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shopping_request (user_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
