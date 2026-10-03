-- Read-only metric examples for MySQL 8. Use the application database timezone (Asia/Shanghai).
-- Set @from_time and @to_time to an explicit half-open interval before running.
-- Example: SET @from_time='2026-10-01 00:00:00', @to_time='2026-11-01 00:00:00';
-- Optional @metric_user_id filters one account; NULL means all accounts.
-- Events are retained for 90 days. Missing exposure is excluded, never imputed.
WITH exposures AS (
    SELECT DISTINCT user_id, workspace_id, plan_version
    FROM behavior_event
    WHERE (@metric_user_id IS NULL OR user_id=@metric_user_id) AND event_type='exposed' AND created_at>=@from_time AND created_at<@to_time
), accepted AS (
    SELECT DISTINCT user_id, workspace_id, plan_version
    FROM behavior_event
    WHERE (@metric_user_id IS NULL OR user_id=@metric_user_id) AND event_type='accepted' AND created_at>=@from_time AND created_at<@to_time
), first_accepted AS (
    SELECT DISTINCT user_id, workspace_id, plan_version
    FROM behavior_event
    WHERE (@metric_user_id IS NULL OR user_id=@metric_user_id) AND event_type='first_accepted' AND created_at>=@from_time AND created_at<@to_time
)
SELECT COUNT(*) AS exposed_plans,
       COUNT(a.workspace_id) AS accepted_exposed_plans,
       COUNT(f.workspace_id) AS first_accepted_exposed_plans,
       COUNT(a.workspace_id)/NULLIF(COUNT(*),0) AS acceptance_rate,
       COUNT(f.workspace_id)/NULLIF(COUNT(*),0) AS first_acceptance_rate
FROM exposures e
LEFT JOIN accepted a ON a.user_id=e.user_id AND a.workspace_id=e.workspace_id AND a.plan_version=e.plan_version
LEFT JOIN first_accepted f ON f.user_id=e.user_id AND f.workspace_id=e.workspace_id AND f.plan_version=e.plan_version;

-- Diagnostic operation counts: events are already deduplicated by event_id.
-- These are writes/operations, not the count of currently completed meals.
SELECT event_type, source, COUNT(*) AS event_count
FROM behavior_event
WHERE (@metric_user_id IS NULL OR user_id=@metric_user_id) AND created_at>=@from_time AND created_at<@to_time
GROUP BY event_type, source;

-- Current actual meals are authoritative; edits and undo must not inflate this count.
SELECT COUNT(*) AS current_completed_meals, COUNT(DISTINCT user_id,meal_date) AS recorded_user_days
FROM meal_consumption
WHERE (@metric_user_id IS NULL OR user_id=@metric_user_id) AND status='eaten' AND meal_date>=DATE(@from_time) AND meal_date<DATE(@to_time);
