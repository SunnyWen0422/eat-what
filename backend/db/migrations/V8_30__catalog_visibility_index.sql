-- Additive covering index for exact public/owner counts; retain on rollback.
SET @ew_visibility_index = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='food' AND index_name='ix_food_visibility'),
    'SELECT 1',
    'ALTER TABLE food ADD KEY ix_food_visibility(user_id,IS_PUBLISHED,id)');
PREPARE ew_visibility_stmt FROM @ew_visibility_index;
EXECUTE ew_visibility_stmt;
DEALLOCATE PREPARE ew_visibility_stmt;
