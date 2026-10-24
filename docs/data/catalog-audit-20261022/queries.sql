-- Read-only queries executed against the 2026-10-22 snapshot.
-- Scope: public catalog only. No credentials or private user records.
-- The joined result was consumed with a streaming cursor, not dumped to chat.

SET SESSION MAX_EXECUTION_TIME=10000;
SET SESSION TRANSACTION READ ONLY;
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;

SELECT COUNT(*) AS n FROM `food`;

SELECT COUNT(*) AS n FROM `dish_quality_profile`;

SELECT COUNT(*) AS n FROM `dish_quality_revision`;

SELECT COUNT(*) AS n FROM `dish_ingredient`;

SELECT COUNT(*) AS n FROM `ingredient_catalog`;

SELECT COUNT(*) AS n FROM `dish_quality_profile` t LEFT JOIN food f ON f.id=t.dish_id WHERE f.id IS NULL;

SELECT COUNT(*) AS n FROM `dish_quality_revision` t LEFT JOIN food f ON f.id=t.dish_id WHERE f.id IS NULL;

SELECT COUNT(*) AS n FROM `dish_ingredient` t LEFT JOIN food f ON f.id=t.dish_id WHERE f.id IS NULL;

SELECT f.*,q.dataset_version AS quality_dataset_version,q.source_hash AS quality_source_hash,q.content_hash AS quality_content_hash,q.review_status AS quality_review_status,q.profile_json AS quality_profile,q.updated_at AS quality_updated_at FROM food f LEFT JOIN dish_quality_profile q ON q.dish_id=f.id WHERE f.is_custom=0 AND f.is_published=1 AND f.user_id IS NULL ORDER BY f.id;

ROLLBACK;
