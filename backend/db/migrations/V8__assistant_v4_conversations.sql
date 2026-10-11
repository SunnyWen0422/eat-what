-- Additive, rerunnable DDL. No old assistant or business domain table is modified.
-- Disable ASSISTANT_V4_ENABLED for application rollback; retain these tables and domain receipts.
CREATE TABLE IF NOT EXISTS assistant_v4_session (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id BIGINT NOT NULL,
 workspace_id VARCHAR(100) NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 PRIMARY KEY (id), UNIQUE KEY uk_av4_session_owner (user_id,id),
 UNIQUE KEY uk_av4_session_request (user_id,request_id), KEY ix_av4_session_age (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS assistant_v4_turn (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id BIGINT NOT NULL,
 session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 workspace_id VARCHAR(100) NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status VARCHAR(32) NOT NULL,
 input_json JSON NULL, result_json JSON NULL, continuation_json JSON NULL,
 lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 lease_until BIGINT NOT NULL DEFAULT 0, model_deadline_at BIGINT NOT NULL DEFAULT 0,
 provider_calls_used INT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_av4_turn_owner(user_id,id),
 UNIQUE KEY uk_av4_turn_request(user_id,session_id,request_id),
 KEY ix_av4_turn_pending(status,lease_until), KEY ix_av4_turn_age(updated_at),
 CONSTRAINT fk_av4_turn_session FOREIGN KEY(user_id,session_id) REFERENCES assistant_v4_session(user_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS assistant_v4_message (
 id BIGINT NOT NULL AUTO_INCREMENT, user_id BIGINT NOT NULL,
 session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 turn_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 role VARCHAR(16) NOT NULL, text_content TEXT NULL, cards_json JSON NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(id), KEY ix_av4_message_page(user_id,session_id,id), KEY ix_av4_message_age(created_at),
 CONSTRAINT fk_av4_message_session FOREIGN KEY(user_id,session_id) REFERENCES assistant_v4_session(user_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
