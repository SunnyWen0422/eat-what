-- Additive, deploy before the balanced recommendation service. No historical backfill.
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id BIGINT NOT NULL,
  meal_date DATE NOT NULL,
  meal_type VARCHAR(16) NOT NULL,
  dish_key CHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  workspace_id VARCHAR(64) NOT NULL,
  plan_version BIGINT NOT NULL,
  dish_id BIGINT NOT NULL,
  features_json JSON NOT NULL,
  policy_version VARCHAR(32) NOT NULL,
  occurred_at VARCHAR(32) NOT NULL,
  revoked TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, meal_date, meal_type, dish_key, event_type),
  KEY ix_recommendation_learning (user_id, occurred_at),
  KEY ix_recommendation_undo (user_id, workspace_id, plan_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recommendation_learning_reset (
  user_id BIGINT NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
