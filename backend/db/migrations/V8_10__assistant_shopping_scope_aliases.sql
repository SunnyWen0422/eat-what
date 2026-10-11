-- Procurement aliases outlive assistant conversations and preserve same-meal source identity.
CREATE TABLE IF NOT EXISTS shopping_scope_aliases (
    user_id BIGINT NOT NULL,
    alias_key CHAR(64) NOT NULL,
    purchase_scope_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, alias_key),
    KEY idx_shopping_scope_owner (user_id, purchase_scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
