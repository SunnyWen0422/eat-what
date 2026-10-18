package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.dto.MealWorkspace;
import com.eatwhat.mapper.AssistantV4Mapper;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.util.*;
import java.util.function.Supplier;

/** Durable owner-scoped state. Transactions never surround provider network calls. */
@Service
public class AssistantV4Store {
    private static final long DAY=86400000L;
    private final AssistantV4Mapper db;private final MealConsumptionMapper locks;
    private final MealWorkspaceService workspaces;private final ObjectMapper json;private final TransactionTemplate tx;private final Clock clock;
    @Autowired public AssistantV4Store(AssistantV4Mapper db,MealConsumptionMapper locks,MealWorkspaceService workspaces,ObjectMapper json,TransactionTemplate tx){this(db,locks,workspaces,json,tx,Clock.systemUTC());}
    public AssistantV4Store(AssistantV4Mapper db,MealConsumptionMapper locks,MealWorkspaceService workspaces,ObjectMapper json,TransactionTemplate tx,Clock clock){
        this.db=db;this.locks=locks;this.workspaces=workspaces;this.json=json.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true).configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY,true);this.tx=tx;this.clock=clock;
    }
    private void requireUser(Long user){if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);}
    private void lock(Long user){requireUser(user);if(locks.lockUser(user)==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);}
    private ResponseStatusException missing(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"会话或任务不存在");}
    private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"内容或任务状态已改变，请查看最新内容");}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("助手状态保存失败");}}
    private <T>T decode(String value,Class<T> type){try{return json.readValue(value,type);}catch(Exception e){throw new IllegalStateException("助手状态读取失败");}}
    private <T>T copy(T value,Class<T> type){return decode(encode(value),type);}
    private SessionRecord session(Long user,String id){requireUser(user);SessionRecord row=db.session(user,id);if(row==null)throw missing();return row;}
    public TurnRecord turnRecord(Long user,String id){requireUser(user);TurnRecord row=db.turn(user,id);if(row==null)throw missing();return copy(row,TurnRecord.class);}
    public SessionView createSession(Long user,SessionRequest request){
        if(request==null)throw new IllegalArgumentException("缺少会话请求");AssistantV4Contract.parseSession(json.valueToTree(request));
        return tx.execute(t->{lock(user);String hash=WorkflowRequestHash.sha256("assistant-session-v4|"+request.getWorkspaceId());SessionRecord old=db.sessionByRequest(user,request.getRequestId());
            if(old!=null){if(!hash.equals(old.getRequestHash()))throw conflict();return sessionView(user,old.getId(),null,30);}
            workspaces.get(user,request.getWorkspaceId());SessionRecord r=new SessionRecord();r.setId(UUID.randomUUID().toString());r.setUserId(user);r.setWorkspaceId(request.getWorkspaceId());r.setRequestId(request.getRequestId());r.setRequestHash(hash);r.setCreatedAt(clock.millis());r.setUpdatedAt(clock.millis());db.insertSession(r);return sessionView(user,r.getId(),null,30);
        });
    }
    public SessionState sessionState(Long user,String id){
        SessionRecord s=session(user,id);SessionState state=new SessionState();state.setSessionId(id);state.setUserId(user);state.setWorkspaceId(s.getWorkspaceId());
        List<Message> messages=sessionView(user,id,null,12).getMessages();
        // One bounded, authoritative pending action survives the text window. Older
        // pending turns remain recoverable in the UI, but do not crowd model context.
        TurnRecord current=db.latestPendingSessionTurn(user,id,clock.millis()-30*DAY);TurnResult result=null;
        if(current!=null&&Objects.equals(user,current.getUserId())&&id.equals(current.getSessionId())&&Objects.equals(s.getWorkspaceId(),current.getWorkspaceId())
                &&"awaiting_confirmation".equals(current.getStatus())&&current.getCreatedAt()>clock.millis()-30*DAY&&current.getResultJson()!=null)result=decode(current.getResultJson(),TurnResult.class);
        PendingAction pending=result==null?null:result.getPendingAction();
        Message latestAssistant=null;boolean included=false;
        // Message cards are historical snapshots. Only the latest durable parent
        // can supply a pending preview, not a cancelled/replaced/completed snapshot.
        for(Message message:messages){
            if("assistant".equals(message.getRole()))latestAssistant=message;
            List<Card> cards=new ArrayList<>();
            for(Card card:message.getCards()){
                if(card.getReceiptRef()!=null||card.getTaskId()==null){cards.add(card);continue;}
                if(pending!=null&&Objects.equals(current.getId(),message.getTurnId())&&Objects.equals(pending.getTaskId(),card.getTaskId())&&Objects.equals(pending.getPreviewToken(),card.getPreviewToken())){cards.add(card);included=true;}
            }
            message.setCards(cards);
        }
        if(!included&&pending!=null&&pending.getTaskId()!=null)for(Card card:result.getCards())
            if(card.getReceiptRef()==null&&pending.getTaskId().equals(card.getTaskId())&&Objects.equals(pending.getPreviewToken(),card.getPreviewToken())){
                // This is a detached server-only context projection, never a new message.
                if(latestAssistant==null){latestAssistant=new Message();latestAssistant.setRole("assistant");messages.add(latestAssistant);}
                latestAssistant.getCards().add(card);break;
            }
        state.setMessages(messages);return state;
    }
    public SessionView sessionView(Long user,String id,String cursor,int limit){
        SessionRecord s=session(user,id);if(limit<1||limit>50)throw new IllegalArgumentException("分页数量无效");long before=Long.MAX_VALUE;
        if(cursor!=null){try{before=Long.parseLong(cursor);if(before<=0)throw new NumberFormatException();}catch(NumberFormatException e){throw new IllegalArgumentException("分页标识无效");}}
        SessionView v=new SessionView();v.setSessionId(id);WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(s.getWorkspaceId());v.setWorkspaceRef(ref);
        try{MealWorkspace w=workspaces.get(user,s.getWorkspaceId());if(w!=null){ref.setWorkspaceRevision(w.getRevision());if(w.getDraft()!=null)ref.setPlanVersion(w.getDraft().getPlanVersion());if(w.getContext()!=null){Map<String,String> target=new LinkedHashMap<>();target.put("date",w.getContext().getDate());target.put("mealType",w.getContext().getMealType());v.setTarget(target);}}}
        catch(ResponseStatusException absent){if(absent.getStatus()!=HttpStatus.NOT_FOUND)throw absent;}
        TurnRecord latest=db.latestSessionTurn(user,id);
        if(latest!=null){if(!Objects.equals(user,latest.getUserId())||!Objects.equals(id,latest.getSessionId()))throw new IllegalStateException("会话记录归属异常");v.setLatestTurn(view(latest));}
        List<Map<String,Object>> rows=db.messages(user,id,before,limit+1,clock.millis()-30*DAY);if(rows==null)rows=Collections.emptyList();
        for(int i=0;i<Math.min(rows.size(),limit);i++){Map<String,Object> r=rows.get(i);Message m=new Message();m.setId(String.valueOf(r.get("id")));m.setTurnId((String)r.get("turnId"));m.setRole((String)r.get("role"));m.setText((String)r.get("text"));m.setCreatedAt(((Number)r.get("createdAt")).longValue());Object cards=r.get("cardsJson");if(cards!=null)try{m.setCards(json.readValue(cards.toString(),new TypeReference<List<Card>>(){}));}catch(Exception e){throw new IllegalStateException("消息引用读取失败");}v.getMessages().add(m);}
        if(rows.size()>limit)v.setNextCursor(v.getMessages().get(v.getMessages().size()-1).getId());Collections.reverse(v.getMessages());return v;
    }
    public SessionList listSessions(Long user,String cursor,int limit){
        requireUser(user);if(limit<1||limit>50)throw new IllegalArgumentException("分页数量无效");long before=Long.MAX_VALUE;String id="~";
        if(cursor!=null){try{
            if(cursor.length()>150)throw new IllegalArgumentException();
            String raw=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8);
            if(!raw.matches("[0-9]{1,19}\\|[0-9a-f-]{36}"))throw new IllegalArgumentException();
            String[] parts=raw.split("\\|");before=Long.parseLong(parts[0]);id=parts[1];UUID.fromString(id);if(before<0)throw new IllegalArgumentException();
        }catch(Exception invalid){throw new IllegalArgumentException("分页标识无效");}}
        List<SessionSummary> rows=db.sessions(user,before,id,limit+1);if(rows==null)rows=Collections.emptyList();
        SessionList result=new SessionList();
        for(int n=0;n<Math.min(limit,rows.size());n++){SessionSummary row=rows.get(n);if(!Objects.equals(user,row.getUserId()))throw new IllegalStateException("会话记录归属异常");AssistantHistorySummary.normalize(row);
            WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(row.getWorkspaceId());ref.setWorkspaceRevision(row.getWorkspaceRevision());ref.setPlanVersion(row.getPlanVersion());row.setWorkspaceRef(ref);
            if(row.getDate()!=null&&row.getMealType()!=null){Map<String,String> target=new LinkedHashMap<>();target.put("date",row.getDate());target.put("mealType",row.getMealType());row.setTarget(target);}result.getSessions().add(row);
        }
        if(rows.size()>limit){SessionSummary last=result.getSessions().get(result.getSessions().size()-1);result.setNextCursor(Base64.getUrlEncoder().withoutPadding().encodeToString((last.getUpdatedAt()+"|"+last.getSessionId()).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
        return result;
    }
    public TurnView claimTurn(Long user,String sessionId,TurnRequest request){
        if(request==null)throw new IllegalArgumentException("缺少消息");AssistantV4Contract.parseTurn(json.valueToTree(request));
        return tx.execute(t->{lock(user);SessionRecord s=session(user,sessionId);String hash=WorkflowRequestHash.sha256("assistant-turn-v4|"+encode(request));
            TurnRecord old=db.turnByRequest(user,sessionId,request.getRequestId());if(old!=null){if(!hash.equals(old.getRequestHash()))throw conflict();return view(old);}
            if(!Objects.equals(s.getWorkspaceId(),request.getWorkspaceId()))throw conflict();MealWorkspace w=workspaces.get(user,request.getWorkspaceId());
            if(!Objects.equals(w.getRevision(),request.getExpectedWorkspaceRevision())||!Objects.equals(w.getDraft().getPlanVersion(),request.getExpectedPlanVersion()))throw conflict();
            if(request.getClarificationChoice()!=null){
                TurnRecord parent=turnRecord(user,request.getClarificationChoice().getContinuationRef());
                AssistantGuidanceService.validateChoice(user,sessionId,request,parent,w,json,clock.millis(),false);
                TurnResult previous=decode(parent.getResultJson(),TurnResult.class);
                for(Card card:previous.getCards())if("clarification".equals(card.getType())&&Objects.equals(parent.getId(),card.getData().get("continuationRef")))card.getData().put("consumedByRequestId",request.getRequestId());
                // Same lock/transaction as the new turn insert: failures do not consume a choice.
                if(db.consumeClarification(user,parent.getId(),encode(previous))!=1)throw conflict();
            }
            TurnRecord r=new TurnRecord();r.setId(UUID.randomUUID().toString());r.setUserId(user);r.setSessionId(sessionId);r.setWorkspaceId(s.getWorkspaceId());r.setRequestId(request.getRequestId());r.setRequestHash(hash);r.setStatus("queued");r.setInputJson(encode(request));r.setCreatedAt(clock.millis());r.setUpdatedAt(clock.millis());
            TurnResult result=new TurnResult();WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(s.getWorkspaceId());ref.setWorkspaceRevision(w.getRevision());ref.setPlanVersion(w.getDraft().getPlanVersion());result.setWorkspaceRef(ref);r.setResultJson(encode(result));db.insertTurn(r);
            db.message(user,sessionId,r.getId(),"user",request.getMessage(),"[]",clock.millis());db.trimMessages(user,sessionId);db.touchSession(user,sessionId,clock.millis());return view(r);
        });
    }
    public TurnView findTurn(Long user,String id){return view(turnRecord(user,id));}
    /** Settle a known failed task, including expired previews. This never authorizes a write. */
    public TurnView failPendingAction(Long user,String id,String stepId,String taskId,String message){return tx.execute(t->{
        lock(user);TurnRecord row=turnRecord(user,id);
        if(!"awaiting_confirmation".equals(row.getStatus()))return view(row);
        TurnResult result=decode(row.getResultJson(),TurnResult.class);PendingAction pending=result.getPendingAction();
        WorkflowContinuation c=continuation(user,id);
        if(pending==null||!Objects.equals(stepId,pending.getStepId())||!Objects.equals(taskId,pending.getTaskId())||c==null||c.getCursor()>=c.getSteps().size())return view(row);
        WorkflowStep current=c.getSteps().get(c.getCursor());
        if(!Objects.equals(stepId,current.getStepId())||!Objects.equals(taskId,current.getTaskId())||!"awaiting_confirmation".equals(current.getStatus()))return view(row);
        current.setStatus("failed");Set<String> receipts=new HashSet<>();
        for(WorkflowStep step:c.getSteps()){
            if("completed".equals(step.getStatus())&&step.getReceiptRef()!=null)receipts.add(step.getReceiptRef());
            else if("pending".equals(step.getStatus()))step.setStatus("cancelled");
        }
        List<Card> cards=new ArrayList<>();for(Card card:result.getCards())if(card!=null&&receipts.contains(card.getReceiptRef())&&card.getPreviewToken()==null)cards.add(card);
        result.setCards(cards);result.setContinuation(c);result.setPendingAction(null);result.setRetryable(false);
        result.setStatus(receipts.isEmpty()?"failed":"partially_completed");result.setReply(message+(receipts.isEmpty()?"":"；已完成的内容仍保留"));
        return saveResult(row,row.getStatus(),row.getLeaseToken(),result,true);
    });}
    public TurnRequest turnRequest(Long user,String id){TurnRecord r=turnRecord(user,id);if(r.getInputJson()==null)throw conflict();return decode(r.getInputJson(),TurnRequest.class);}
    public WorkflowContinuation continuation(Long user,String id){TurnRecord r=turnRecord(user,id);return r.getContinuationJson()==null?null:decode(r.getContinuationJson(),WorkflowContinuation.class);}
    /** Persist validated intents before any adapter mutation; never store provider continuation here. */
    public WorkflowContinuation checkpointContinuation(Long user,String id,String lease,WorkflowContinuation continuation){return withActiveLease(user,id,lease,()->{
        TurnRecord row=turnRecord(user,id);validateWorkflow(id,continuation);rejectTransient(json.valueToTree(continuation));
        if(row.getContinuationJson()!=null){WorkflowContinuation existing=decode(row.getContinuationJson(),WorkflowContinuation.class);if(!encode(existing).equals(encode(continuation)))throw conflict();return existing;}
        row.setContinuationJson(encode(continuation));row.setUpdatedAt(clock.millis());if(db.save(row,"running",lease)!=1)throw conflict();return copy(continuation,WorkflowContinuation.class);
    });}
    /** Invoke inside the domain confirmation transaction, after the real receipt exists. No business write is performed here. */
    public TurnView completeWorkflowStep(Long user,String turnId,String stepId,String receiptRef,Card receiptCard){
        if(receiptRef==null||receiptRef.trim().isEmpty())throw new IllegalArgumentException("缺少业务回执");
        return withActiveParent(user,turnId,stepId,()->{TurnRecord row=turnRecord(user,turnId);WorkflowContinuation c=continuation(user,turnId);WorkflowStep s=c.getSteps().get(c.getCursor());s.setStatus("completed");s.setReceiptRef(receiptRef);c.setCursor(c.getCursor()+1);
            TurnResult result=row.getResultJson()==null?new TurnResult():decode(row.getResultJson(),TurnResult.class);result.setContinuation(c);result.setPendingAction(null);List<Card> receipts=new ArrayList<>();for(Card existing:result.getCards())if(existing.getReceiptRef()!=null&&!existing.getReceiptRef().trim().isEmpty()&&(receiptCard==null||!Objects.equals(existing.getReceiptRef(),receiptCard.getReceiptRef())))receipts.add(existing);if(receiptCard!=null)receipts.add(receiptCard);result.setCards(receipts);result.setRetryable(c.getCursor()<c.getSteps().size());result.setStatus(c.getCursor()==c.getSteps().size()?"completed":"awaiting_confirmation");
            if(receiptCard!=null&&Objects.equals(receiptRef,receiptCard.getReceiptRef())&&receiptCard.getWorkspaceRef()!=null){
                WorkspaceRef next=receiptCard.getWorkspaceRef(),old=result.getWorkspaceRef();
                if(Objects.equals(row.getWorkspaceId(),next.getWorkspaceId())&&next.getWorkspaceRevision()!=null&&next.getPlanVersion()!=null&&next.getWorkspaceRevision()>=0&&next.getPlanVersion()>=0
                        &&(old==null||((old.getWorkspaceRevision()==null||next.getWorkspaceRevision()>=old.getWorkspaceRevision())&&(old.getPlanVersion()==null||next.getPlanVersion()>=old.getPlanVersion()))))result.setWorkspaceRef(copy(next,WorkspaceRef.class));
            }
            result.setReply(c.getCursor()==c.getSteps().size()?"已完成":"已保存，正在准备下一步");return saveResult(row,row.getStatus(),row.getLeaseToken(),result,true);
        });
    }
    public TurnRecord acquireTurn(Long user,String id){return tx.execute(t->{lock(user);turnRecord(user,id);String lease=UUID.randomUUID().toString();long deadline=clock.millis()+30000;if(db.acquire(user,id,lease,deadline,deadline)!=1)throw conflict();return turnRecord(user,id);});}
    /** Must commit before starting each HTTP request. A timeout never refunds this reservation. */
    public int reserveProviderCall(Long user,String id,String lease){return tx.execute(t->{lock(user);if(lease==null||db.reserve(user,id,lease,clock.millis())!=1)throw conflict();return turnRecord(user,id).getProviderCallsUsed();});}
    /** Running completions require the lease overload, preventing a stale worker from completing a different lease. */
    public TurnView completeTurn(Long user,String id,String expectedStatus,TurnResult result){if("running".equals(expectedStatus))throw conflict();return completeTurn(user,id,expectedStatus,null,result);}
    public TurnView completeTurn(Long user,String id,String expectedStatus,String lease,TurnResult result){return tx.execute(t->{lock(user);TurnRecord r=turnRecord(user,id);if(!Objects.equals(r.getStatus(),expectedStatus)||AssistantV4Contract.terminal(r.getStatus()))throw conflict();if("running".equals(expectedStatus))activeLease(r,lease);return saveResult(r,expectedStatus,lease,result,true);});}
    private TurnView saveResult(TurnRecord row,String expected,String lease,TurnResult result,boolean append){
        return saveResult(row,expected,lease,result,append,true);
    }
    private TurnView saveResult(TurnRecord row,String expected,String lease,TurnResult result,boolean append,boolean touchSession){
        if(result==null||!AssistantV4Contract.STATUSES.contains(result.getStatus())||Arrays.asList("queued","running").contains(result.getStatus()))throw new IllegalArgumentException("任务结果状态无效");
        if(result.getReply()!=null&&result.getReply().length()>4000)throw new IllegalArgumentException("回复过长");rejectTransient(json.valueToTree(result));validateWorkflow(row.getId(),result.getContinuation());
        WorkflowContinuation incoming=result.getContinuation();WorkflowContinuation previous=row.getContinuationJson()==null?null:decode(row.getContinuationJson(),WorkflowContinuation.class);
        validateProgress(previous,incoming);
        PendingAction pending=result.getPendingAction();
        if(pending!=null){
            if(!"awaiting_confirmation".equals(result.getStatus())||incoming==null||incoming.getCursor()>=incoming.getSteps().size())throw conflict();
            WorkflowStep current=incoming.getSteps().get(incoming.getCursor());
            if(!Objects.equals(current.getStepId(),pending.getStepId())||!"awaiting_confirmation".equals(current.getStatus()))throw conflict();
        }
        if(incoming!=null){WorkflowContinuation next=copy(incoming,WorkflowContinuation.class);next.setRevision(incoming.getRevision()+1);row.setContinuationJson(encode(next));}
        row.setStatus(result.getStatus());row.setUpdatedAt(clock.millis());row.setLeaseToken(null);row.setLeaseUntil(0);
        // Awaiting confirmation is not governed by the model deadline. Preview expiresAt remains independent.
        if("awaiting_confirmation".equals(row.getStatus()))row.setModelDeadlineAt(0);
        TurnResult stored=copy(result,TurnResult.class);stored.setContinuation(null);row.setResultJson(encode(stored));
        if(db.save(row,expected,lease)!=1)throw conflict();if(append&&(result.getReply()!=null||!result.getCards().isEmpty())){db.message(row.getUserId(),row.getSessionId(),row.getId(),"assistant",result.getReply(),encode(result.getCards()),clock.millis());db.trimMessages(row.getUserId(),row.getSessionId());}
        if(touchSession)db.touchSession(row.getUserId(),row.getSessionId(),clock.millis());return view(row);
    }
    /** Caller must hold the current durable version. Intent data and acknowledged receipts are immutable. */
    private void validateProgress(WorkflowContinuation old,WorkflowContinuation next){
        if(old==null){if(next!=null){if(next.getRevision()!=0||next.getCursor()!=0)throw conflict();for(WorkflowStep s:next.getSteps())if("completed".equals(s.getStatus())||s.getReceiptRef()!=null)throw conflict();}return;}
        if(next==null||next.getRevision()<0||next.getRevision()==Long.MAX_VALUE||next.getRevision()!=old.getRevision()||!Objects.equals(next.getId(),old.getId())||next.getSteps().size()!=old.getSteps().size()||next.getCursor()<old.getCursor()||next.getCursor()>old.getCursor()+1)throw conflict();
        for(int i=0;i<old.getSteps().size();i++){
            WorkflowStep before=old.getSteps().get(i),after=next.getSteps().get(i);
            if(!Objects.equals(before.getStepId(),after.getStepId())||!Objects.equals(before.getRequestId(),after.getRequestId())||!Objects.equals(before.getKind(),after.getKind())||!Objects.equals(before.getDependsOn(),after.getDependsOn())||!encode(before.getArguments()).equals(encode(after.getArguments())))throw conflict();
            if("completed".equals(before.getStatus())&&!encode(before).equals(encode(after)))throw conflict();
            if(Arrays.asList("failed","cancelled").contains(before.getStatus())&&!encode(before).equals(encode(after)))throw conflict();
            if(i<next.getCursor()){if(!"completed".equals(after.getStatus())||after.getReceiptRef()==null||after.getReceiptRef().trim().isEmpty())throw conflict();}
            else if("completed".equals(after.getStatus())||after.getReceiptRef()!=null)throw conflict();
            if("awaiting_confirmation".equals(before.getStatus())&&"pending".equals(after.getStatus()))throw conflict();
        }
    }
    private void rejectTransient(JsonNode n){if(n.isObject()){Iterator<Map.Entry<String,JsonNode>> fields=n.fields();while(fields.hasNext()){Map.Entry<String,JsonNode> e=fields.next();if(Arrays.asList("reasoning_content","tool_calls","assistantMessage","providerContinuation","messages","userId","ownerUserId","authorization","apiKey").contains(e.getKey()))throw new IllegalArgumentException("不可保存内部供应商或身份内容");rejectTransient(e.getValue());}}else if(n.isArray())for(JsonNode item:n)rejectTransient(item);}
    private void validateWorkflow(String turnId,WorkflowContinuation c){if(c==null)return;if(c.getSteps()==null||c.getSteps().isEmpty()||c.getSteps().size()>3||c.getCursor()<0||c.getCursor()>c.getSteps().size())throw new IllegalArgumentException("续办步骤无效");List<ActionIntent> actions=new ArrayList<>();for(WorkflowStep s:c.getSteps()){ActionIntent a=new ActionIntent();a.setKind(s.getKind());a.setArguments(s.getArguments());actions.add(a);}WorkflowContinuation expected=AssistantV4Contract.workflow(turnId,actions);if(!expected.getId().equals(c.getId()))throw new IllegalArgumentException("续办标识无效");for(int i=0;i<c.getSteps().size();i++){WorkflowStep s=c.getSteps().get(i),e=expected.getSteps().get(i);if(!Objects.equals(e.getStepId(),s.getStepId())||!Objects.equals(e.getRequestId(),s.getRequestId())||!Objects.equals(e.getDependsOn(),s.getDependsOn())||!Arrays.asList("pending","awaiting_confirmation","completed","failed","cancelled").contains(s.getStatus()))throw new IllegalArgumentException("续办步骤标识无效");}}
    private TurnView view(TurnRecord r){TurnResult result=r.getResultJson()==null?new TurnResult():decode(r.getResultJson(),TurnResult.class);TurnView v=new TurnView();v.setTurnId(r.getId());v.setStatus(r.getStatus());v.setReply(result.getReply());v.setCards(result.getCards());v.setWorkspaceRef(result.getWorkspaceRef());if(v.getWorkspaceRef()==null){WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(r.getWorkspaceId());v.setWorkspaceRef(ref);}v.setPendingAction(result.getPendingAction());v.setRetryable(result.isRetryable());if(r.getContinuationJson()!=null)v.setContinuation(AssistantV4Contract.publicWorkflow(decode(r.getContinuationJson(),WorkflowContinuation.class)));return v;}
    public TurnView cancelTurn(Long user,String id){return tx.execute(t->{lock(user);return cancelLocked(turnRecord(user,id),true);});}
    private TurnView cancelLocked(TurnRecord r,boolean touchSession){
        if(AssistantV4Contract.terminal(r.getStatus()))return view(r);
        TurnResult result=r.getResultJson()==null?new TurnResult():decode(r.getResultJson(),TurnResult.class);
        Set<String> completedReceipts=new HashSet<>();
        if(r.getContinuationJson()!=null){
            WorkflowContinuation c=decode(r.getContinuationJson(),WorkflowContinuation.class);
            for(WorkflowStep step:c.getSteps()){
                if("completed".equals(step.getStatus())&&step.getReceiptRef()!=null&&!step.getReceiptRef().trim().isEmpty())completedReceipts.add(step.getReceiptRef());
                else if(Arrays.asList("pending","awaiting_confirmation").contains(step.getStatus()))step.setStatus("cancelled");
            }
            result.setContinuation(c);
        }
        // Only durable acknowledged operations survive; a card alone is not evidence of success.
        List<Card> receipts=new ArrayList<>();
        for(Card card:result.getCards())if(card!=null&&completedReceipts.contains(card.getReceiptRef())&&card.getPreviewToken()==null)receipts.add(card);
        result.setCards(receipts);result.setStatus("cancelled");result.setReply("已停止，已保存的内容仍保留");result.setPendingAction(null);result.setRetryable(false);
        return saveResult(r,r.getStatus(),r.getLeaseToken(),result,false,touchSession);
    }
    public void deleteSession(Long user,String id){tx.execute(t->{lock(user);session(user,id);List<TurnRecord> active=db.activeSessionTurns(user,id);if(active!=null)for(TurnRecord r:active)cancelTurn(user,r.getId());db.deleteSession(user,id);return null;});}
    private void activeLease(TurnRecord r,String lease){if(!"running".equals(r.getStatus())||lease==null||!lease.equals(r.getLeaseToken())||r.getLeaseUntil()<=clock.millis()||r.getModelDeadlineAt()<=clock.millis())throw conflict();}
    /** Draft mutation and turn finalization must execute inside this transaction, with the same user lock. */
    public <T>T withActiveLease(Long user,String turnId,String lease,Supplier<T> work){return tx.execute(t->{lock(user);TurnRecord r=turnRecord(user,turnId);session(user,r.getSessionId());activeLease(r,lease);return work.get();});}
    /** Confirmation adapters MUST put their domain write and receipt in this callback. */
    public <T>T withActiveParent(Long user,String turnId,String stepId,Supplier<T> work){return tx.execute(t->{
        lock(user);TurnRecord r=turnRecord(user,turnId);session(user,r.getSessionId());
        if(r.getCreatedAt()<=clock.millis()-30*DAY||!Arrays.asList("running","awaiting_confirmation").contains(r.getStatus()))throw conflict();
        if("running".equals(r.getStatus())&&(r.getLeaseUntil()<=clock.millis()||r.getModelDeadlineAt()<=clock.millis()))throw conflict();
        WorkflowContinuation c=continuation(user,turnId);if(c==null||c.getCursor()>=c.getSteps().size())throw conflict();WorkflowStep s=c.getSteps().get(c.getCursor());
        if(!Objects.equals(s.getStepId(),stepId)||!Arrays.asList("pending","awaiting_confirmation").contains(s.getStatus()))throw conflict();
        if("awaiting_confirmation".equals(s.getStatus())){TurnResult result=decode(r.getResultJson(),TurnResult.class);PendingAction p=result.getPendingAction();if(p==null||!stepId.equals(p.getStepId())||p.getExpiresAt()==null||p.getExpiresAt()<=clock.millis())throw conflict();}
        for(String dependency:s.getDependsOn())if(c.getSteps().stream().noneMatch(p->dependency.equals(p.getStepId())&&"completed".equals(p.getStatus())))throw conflict();return work.get();
    });}
    /** Explicit user repreview may renew an expired token, but never resurrect a cancelled parent. */
    public <T>T withRepreviewParent(Long user,String turnId,String stepId,String oldTaskId,Supplier<T> work){return tx.execute(t->{
        lock(user);TurnRecord row=turnRecord(user,turnId);session(user,row.getSessionId());
        if(row.getCreatedAt()<=clock.millis()-30*DAY||!"awaiting_confirmation".equals(row.getStatus()))throw conflict();
        WorkflowContinuation c=continuation(user,turnId);if(c==null||c.getCursor()>=c.getSteps().size())throw conflict();
        WorkflowStep step=c.getSteps().get(c.getCursor());TurnResult result=decode(row.getResultJson(),TurnResult.class);PendingAction p=result.getPendingAction();
        if(!"awaiting_confirmation".equals(step.getStatus())||!Objects.equals(stepId,step.getStepId())||!Objects.equals(oldTaskId,step.getTaskId())||p==null||!Objects.equals(stepId,p.getStepId())||!Objects.equals(oldTaskId,p.getTaskId()))throw conflict();
        for(String dependency:step.getDependsOn())if(c.getSteps().stream().noneMatch(s->dependency.equals(s.getStepId())&&"completed".equals(s.getStatus())))throw conflict();
        return work.get();
    });}
    public TurnView replacePendingAction(Long user,String turnId,String stepId,String oldTaskId,PendingAction pending,Card card){
        return withRepreviewParent(user,turnId,stepId,oldTaskId,()->{
            if(pending==null||!Objects.equals(stepId,pending.getStepId())||pending.getTaskId()==null||Objects.equals(oldTaskId,pending.getTaskId())||pending.getPreviewToken()==null||pending.getExpiresAt()==null||pending.getExpiresAt()<=clock.millis()||card==null||!Objects.equals(pending.getTaskId(),card.getTaskId())||!Objects.equals(pending.getPreviewToken(),card.getPreviewToken()))throw conflict();
            TurnRecord row=turnRecord(user,turnId);TurnResult result=decode(row.getResultJson(),TurnResult.class);WorkflowContinuation c=continuation(user,turnId);c.getSteps().get(c.getCursor()).setTaskId(pending.getTaskId());
            List<Card> cards=new ArrayList<>();for(Card previous:result.getCards())if(previous.getReceiptRef()!=null&&!previous.getReceiptRef().trim().isEmpty())cards.add(previous);cards.add(card);
            result.setContinuation(c);result.setPendingAction(pending);result.setCards(cards);result.setRetryable(false);result.setReply("采购预览已更新，请核对后确认");return saveResult(row,"awaiting_confirmation",null,result,true);
        });
    }
    /** Recovery never reconstructs provider frames and never issues another provider request itself. */
    public List<TurnRecord> recoverable(){return db.recoverable(clock.millis());}
    public TurnView recoverExpired(Long user,String id){return tx.execute(t->{lock(user);TurnRecord r=turnRecord(user,id);if(!"running".equals(r.getStatus())||r.getLeaseUntil()>clock.millis())return view(r);TurnResult result=new TurnResult();result.setStatus("failed");result.setReply("本次对话已中断，请重新发送；已保存内容仍保留");result.setRetryable(true);if(r.getContinuationJson()!=null){WorkflowContinuation c=decode(r.getContinuationJson(),WorkflowContinuation.class);boolean done=false;for(WorkflowStep s:c.getSteps()){if("completed".equals(s.getStatus()))done=true;else s.setStatus("failed");}result.setContinuation(c);if(done)result.setStatus("partially_completed");}return saveResult(r,"running",r.getLeaseToken(),result,false);});}
    @Scheduled(fixedDelay=3600000,initialDelay=3600000) public void scheduledPurge(){if(db.installedSchemaTables()==3)purgeExpired();}
    public void purgeExpired(){
        long now=clock.millis();List<SessionRecord> idle=db.idleSessions(now-30*DAY);if(idle!=null)for(SessionRecord s:idle)tx.execute(t->{lock(s.getUserId());SessionRecord current=db.session(s.getUserId(),s.getId());if(current!=null&&current.getUpdatedAt()<now-30*DAY)deleteSession(s.getUserId(),s.getId());return null;});
        for(;;){List<TurnRecord> expired=db.expiredActiveTurns(now,now-30*DAY);if(expired==null||expired.isEmpty())break;int cancelled=0;
            for(TurnRecord candidate:expired){Boolean changed=tx.execute(t->{lock(candidate.getUserId());TurnRecord current=db.turn(candidate.getUserId(),candidate.getId());if(current==null||AssistantV4Contract.terminal(current.getStatus())||!expired(current,now))return false;cancelLocked(copy(current,TurnRecord.class),false);return true;});if(Boolean.TRUE.equals(changed))cancelled++;}
            if(expired.size()<100||cancelled==0)break;
        }
        db.purgeMessageText(now-30*DAY);db.purgeTerminalInputs(now-7*DAY);db.purgeOldTurnText(now-30*DAY);db.purgeTerminalMetadata(now-90*DAY);
    }
    private boolean expired(TurnRecord r,long now){
        if(r.getCreatedAt()<=now-30*DAY)return true;
        if("running".equals(r.getStatus()))return r.getLeaseUntil()<=now;
        // Token expiry blocks confirmation, not an explicit repreview or validated continuation.
        // The absolute createdAt bound above still ends sensitive workflow retention.
        return false;
    }
}
