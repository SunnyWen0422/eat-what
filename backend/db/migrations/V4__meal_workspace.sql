-- V4 additive workspace storage. Invoke against an explicitly selected test database first.
CREATE TABLE IF NOT EXISTS meal_workspace (
 id VARCHAR(36) PRIMARY KEY, user_id BIGINT NOT NULL, meal_date DATE NOT NULL, meal_type VARCHAR(16) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0, state_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_workspace_slot(user_id,meal_date,meal_type), KEY ix_workspace_age(updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workspace_task (
 id VARCHAR(36) PRIMARY KEY, workspace_id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, base_revision BIGINT NOT NULL,
 status VARCHAR(32) NOT NULL, input_json JSON NOT NULL, result_json JSON NULL, lease_token VARCHAR(36) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_task_poll(status,updated_at), KEY ix_task_owner(user_id,workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workspace_request_log (
 user_id BIGINT NOT NULL, request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, response_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS behavior_event (
 event_id VARCHAR(128) PRIMARY KEY, user_id BIGINT NOT NULL, workspace_id VARCHAR(36) NOT NULL, plan_version BIGINT NOT NULL,
 event_type VARCHAR(32) NOT NULL, source VARCHAR(32) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_event_metric(event_type,created_at), KEY ix_event_owner(user_id,workspace_id,plan_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SET @add_default_people = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_preference' AND column_name='DEFAULT_PEOPLE')=0,
 'ALTER TABLE user_preference ADD COLUMN DEFAULT_PEOPLE INT NOT NULL DEFAULT 2','SELECT 1');
PREPARE v4_stmt FROM @add_default_people; EXECUTE v4_stmt; DEALLOCATE PREPARE v4_stmt;

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·燕麦粥','staple','燕麦片:80克#水:500毫升','2人基础份量','将水煮沸，加入即食燕麦片。###小火煮至燕麦软熟，按包装说明延长烹调。','燕麦片|80|克|主料||2人基础份量|人工整理###水|500|毫升|主料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 10,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·燕麦粥' AND user_id IS NULL);

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·蒸玉米','staple','玉米:2根#水:适量','2人基础份量','玉米去外皮，洗净。###放入蒸锅，水沸后蒸至玉米完全熟透。','玉米|2|根|主料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 20,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·蒸玉米' AND user_id IS NULL);

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·烤吐司','staple','全麦吐司:4片','2人基础份量','将吐司放入烤面包机。###按设备说明烤至温热，避免烤焦。','全麦吐司|4|片|主料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 5,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·烤吐司' AND user_id IS NULL);

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·水煮鸡蛋','meat','鸡蛋:2个#水:适量','2人基础份量','鸡蛋洗净，放入锅中加水没过鸡蛋。###煮沸后继续煮至蛋白与蛋黄完全凝固，放凉后剥壳。','鸡蛋|2|个|主料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 15,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·水煮鸡蛋' AND user_id IS NULL);

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·清炒小白菜','veg','小白菜:300克#食用油:10毫升#盐:2克','2人基础份量','小白菜洗净切段。###热锅加油，倒入小白菜翻炒至熟，加盐调味。','小白菜|300|克|主料||2人基础份量|人工整理###食用油|10|毫升|调料||2人基础份量|人工整理###盐|2|克|调料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 10,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·清炒小白菜' AND user_id IS NULL);

INSERT INTO food(NAME,TYPE,CL,FL,STEP,INGREDIENTS_AMOUNTS,TAGS,TAG_CODES,COOK_MINUTES,METADATA_VERSION,IS_PUBLISHED,is_custom,user_id) SELECT 'V4 早餐·黄瓜小菜','veg','黄瓜:200克#盐:1克#香醋:5毫升','2人基础份量','黄瓜彻底洗净，用干净刀具切片。###加入盐和香醋拌匀，即做即吃。','黄瓜|200|克|主料||2人基础份量|人工整理###盐|1|克|调料||2人基础份量|人工整理###香醋|5|毫升|调料||2人基础份量|人工整理','早餐,基础菜','BREAKFAST_ELIGIBLE', 5,1,1,0,NULL WHERE NOT EXISTS (SELECT 1 FROM food WHERE NAME='V4 早餐·黄瓜小菜' AND user_id IS NULL);
