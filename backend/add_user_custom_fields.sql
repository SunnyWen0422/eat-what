-- Add fields required by admin user list and custom dishes.
-- Safe to run on MySQL 8; existing columns/indexes are left untouched.

USE food;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(32) DEFAULT NULL COMMENT '用户手机号';

ALTER TABLE food
ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT NULL COMMENT '自定义菜品所属用户ID';

CREATE INDEX IF NOT EXISTS idx_food_user_id ON food(user_id);

COMMIT;
