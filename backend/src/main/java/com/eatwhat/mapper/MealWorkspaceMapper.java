package com.eatwhat.mapper;
import com.eatwhat.entity.*;
import org.apache.ibatis.annotations.*;
import java.util.*;
@Mapper
public interface MealWorkspaceMapper {
    String ROW = "id,user_id AS userId,revision,CAST(state_json AS CHAR) AS stateJson";
    String TASK = "id,workspace_id AS workspaceId,user_id AS userId,base_revision AS baseRevision,status,CAST(input_json AS CHAR) AS inputJson,CAST(result_json AS CHAR) AS resultJson,lease_token AS leaseToken";
    @Select("SELECT "+ROW+" FROM meal_workspace WHERE user_id=#{user} AND meal_date=#{date} AND meal_type=#{meal}")
    WorkspaceRow slot(@Param("user") Long user,@Param("date") String date,@Param("meal") String meal);
    @Select("SELECT "+ROW+" FROM meal_workspace WHERE id=#{id} AND user_id=#{user}")
    WorkspaceRow find(@Param("id") String id,@Param("user") Long user);
    @Insert("INSERT INTO meal_workspace(id,user_id,meal_date,meal_type,revision,state_json) VALUES(#{id},#{user},#{date},#{meal},0,#{json})")
    int create(@Param("id") String id,@Param("user") Long user,@Param("date") String date,@Param("meal") String meal,@Param("json") String json);
    @Update("UPDATE meal_workspace SET revision=#{revision},state_json=#{json},updated_at=NOW() WHERE id=#{id} AND user_id=#{user} AND revision=#{expected}")
    int save(@Param("id") String id,@Param("user") Long user,@Param("revision") Long revision,@Param("expected") Long expected,@Param("json") String json);
    @Select("SELECT request_hash AS requestHash,CAST(response_json AS CHAR) AS responseJson FROM workspace_request_log WHERE user_id=#{user} AND request_id=#{key}")
    Map<String,Object> request(@Param("user") Long user,@Param("key") String key);
    @Insert("INSERT INTO workspace_request_log(user_id,request_id,request_hash,response_json) VALUES(#{user},#{key},#{hash},#{response})")
    int log(@Param("user") Long user,@Param("key") String key,@Param("hash") String hash,@Param("response") String response);
    @Insert("INSERT INTO workspace_task(id,workspace_id,user_id,base_revision,status,input_json) VALUES(#{id},#{workspaceId},#{userId},#{baseRevision},'queued',#{inputJson})")
    int task(WorkspaceTask task);
    @Select("SELECT "+TASK+" FROM workspace_task WHERE id=#{id} AND workspace_id=#{ws} AND user_id=#{user}")
    WorkspaceTask taskById(@Param("id") String id,@Param("ws") String ws,@Param("user") Long user);
    @Select("SELECT "+TASK+" FROM workspace_task WHERE status='queued' OR (status='running' AND updated_at < DATE_SUB(NOW(),INTERVAL 30 SECOND)) ORDER BY created_at LIMIT 8")
    List<WorkspaceTask> pending();
    @Update("UPDATE workspace_task SET status='running',lease_token=#{lease},updated_at=NOW() WHERE id=#{id} AND (status='queued' OR (status='running' AND updated_at < DATE_SUB(NOW(),INTERVAL 30 SECOND)))")
    int claim(@Param("id") String id,@Param("lease") String lease);
    @Update("UPDATE workspace_task SET status=#{status},result_json=#{result},updated_at=NOW() WHERE id=#{id} AND status='running' AND lease_token=#{lease}")
    int finish(@Param("id") String id,@Param("lease") String lease,@Param("status") String status,@Param("result") String result);
    @Update("UPDATE workspace_task SET status='cancelled',input_json='{}',updated_at=NOW() WHERE workspace_id=#{id} AND status IN ('queued','running')")
    int cancel(@Param("id") String id);
    @Insert("INSERT IGNORE INTO behavior_event(event_id,user_id,workspace_id,plan_version,event_type,source) VALUES(#{id},#{user},#{ws},#{version},#{type},#{source})")
    int event(@Param("id") String id,@Param("user") Long user,@Param("ws") String ws,@Param("version") Long version,@Param("type") String type,@Param("source") String source);
    @Delete("DELETE FROM behavior_event WHERE created_at < DATE_SUB(NOW(),INTERVAL 90 DAY) LIMIT 500") int purgeEvents();
    @Update("UPDATE meal_workspace SET state_json=JSON_SET(state_json,'$.draft',JSON_OBJECT('planVersion',JSON_EXTRACT(state_json,'$.draft.planVersion'),'dishes',JSON_ARRAY(),'lockedDishIds',JSON_ARRAY(),'history',JSON_ARRAY(),'source','rules','explanations',JSON_ARRAY()),'$.context.requirements','','$.context.ownedIngredients',JSON_ARRAY(),'$.status','expired','$.taskId',NULL),revision=revision+1 WHERE updated_at < DATE_SUB(NOW(),INTERVAL 30 DAY) AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.status')) NOT IN ('expired','generating','planned') LIMIT 500")
    int expireDrafts();
    @Update("UPDATE workspace_task SET input_json='{}' WHERE status NOT IN ('queued','running') AND created_at < DATE_SUB(NOW(),INTERVAL 30 DAY) LIMIT 500") int purgeTaskInputs();
}
