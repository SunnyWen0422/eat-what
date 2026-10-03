package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.WorkspaceRow;
import com.eatwhat.mapper.*;
import com.eatwhat.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
@Service
public class MealBehaviorService {
    private final MealWorkspaceMapper db;
    private final MealConsumptionMapper locks;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final boolean enabled;
    public MealBehaviorService(MealWorkspaceMapper db,MealConsumptionMapper locks,ObjectMapper json,TransactionTemplate tx,@Value("${meal-workspace.enabled:false}") boolean enabled){this.db=db;this.locks=locks;this.json=json;this.tx=tx;this.enabled=enabled;}
    public Map<String,Object> record(Long user,BehaviorEventRequest event) {
        if(!enabled)throw new IllegalArgumentException("V4 事件采集尚未开启");
        RequestIdValidator.requireValid(event.getRequestId());
        if(!"exposed".equals(event.getEventType()))throw new IllegalArgumentException("事件不在前端允许名单");
        return tx.execute(status->{
            if(locks.lockUser(user)==null)throw new IllegalArgumentException("用户不存在");
            WorkspaceRow row=db.find(event.getWorkspaceId(),user);if(row==null)throw new IllegalArgumentException("工作区不可访问");
            try {
                String hash=WorkflowRequestHash.sha256("event|"+json.writeValueAsString(event));Map<String,Object> prior=db.request(user,event.getRequestId());
                if(prior!=null){if(!hash.equals(prior.get("requestHash")))throw new MealConsumptionService.VersionConflict("事件标识内容已变化");return Collections.singletonMap("recorded",true);}
                MealWorkspace w=json.readValue(row.getStateJson(),MealWorkspace.class);
                if(!Objects.equals(row.getRevision(),event.getExpectedWorkspaceRevision())||!Objects.equals(w.getDraft().getPlanVersion(),event.getPlanVersion())||w.getDraft().getDishes().isEmpty())throw new MealConsumptionService.VersionConflict("曝光方案已变化");
                db.event(key(user,event.getRequestId()),user,w.getId(),event.getPlanVersion(),event.getEventType(),w.getDraft().getSource());
                MealWorkspace receipt=new MealWorkspace();receipt.setId(w.getId());receipt.setRevision(w.getRevision());db.log(user,event.getRequestId(),hash,json.writeValueAsString(receipt));return Collections.singletonMap("recorded",true);
            }catch(MealConsumptionService.VersionConflict e){throw e;}catch(Exception e){throw new IllegalStateException("事件保存失败",e);}
        });
    }
    public void domain(Long user,String date,String meal,String requestId,String type) {
        if(!enabled||date==null||meal==null)return;
        WorkspaceRow row=db.slot(user,date,meal);if(row==null)return;
        try {MealWorkspace w=json.readValue(row.getStateJson(),MealWorkspace.class);db.event(key(user,type+":"+requestId),user,w.getId(),w.getDraft().getPlanVersion(),type,w.getDraft().getSource());}
        catch(Exception e){throw new IllegalStateException("业务事件保存失败",e);}
    }
    private String key(Long user,String value){return WorkflowRequestHash.sha256(user+"|"+value);}
}
