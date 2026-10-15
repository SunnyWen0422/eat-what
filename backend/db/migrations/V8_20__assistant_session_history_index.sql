-- Add only the missing owner-scoped keyset indexes. Retain on application rollback.
SET @ew_session_index = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='assistant_v4_session' AND index_name='ix_av4_session_owner_updated'),
    'SELECT 1',
    'ALTER TABLE assistant_v4_session ADD KEY ix_av4_session_owner_updated(user_id,updated_at,id)');
PREPARE ew_session_stmt FROM @ew_session_index;
EXECUTE ew_session_stmt;
DEALLOCATE PREPARE ew_session_stmt;
SET @ew_turn_index = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='assistant_v4_turn' AND index_name='ix_av4_turn_session_updated'),
    'SELECT 1',
    'ALTER TABLE assistant_v4_turn ADD KEY ix_av4_turn_session_updated(user_id,session_id,updated_at,id)');
PREPARE ew_turn_stmt FROM @ew_turn_index;
EXECUTE ew_turn_stmt;
DEALLOCATE PREPARE ew_turn_stmt;
