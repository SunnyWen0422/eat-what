package com.eatwhat.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Versioned boundary. Public requests are parsed explicitly, never by permissive bean binding. */
public final class AssistantV4Contract {
    private AssistantV4Contract() {}
    public static final String SCHEMA_VERSION="assistant.v4.1";
    public static final Set<String> STATUSES=Collections.unmodifiableSet(new HashSet<>(Arrays.asList("queued","running","needs_input","awaiting_confirmation","completed","partially_completed","failed","cancelled")));
    public static final Set<String> ACTIONS=Collections.unmodifiableSet(new HashSet<>(Arrays.asList("draft_update","calendar_save","shopping_preview")));
    public static boolean terminal(String status) {return Arrays.asList("needs_input","completed","partially_completed","failed","cancelled").contains(status);}

    @Data public static class SessionRequest {private String workspaceId; private String requestId;}
    @Data public static class TurnRequest {
        private String requestId; private String message; private String workspaceId;
        private Long expectedWorkspaceRevision; private Long expectedPlanVersion; private String entryScene;
    }
    @Data public static class WorkspaceRef {private String workspaceId; private Long workspaceRevision; private Long planVersion;}
    @Data public static class Capabilities {
        private String schemaVersion=SCHEMA_VERSION; private boolean enabled;
        private List<String> reads=new ArrayList<>(),draftCommands=new ArrayList<>(),previewActions=new ArrayList<>();
    }
    @Data @JsonInclude(JsonInclude.Include.NON_NULL) public static class Card {
        private String id,type,title,text; private String taskId,previewToken,receiptRef;
        private Long expiresAt; private WorkspaceRef workspaceRef;
        // Only authenticated adapter-produced display snapshots, never provider payloads.
        private Map<String,Object> data=new LinkedHashMap<>();
    }
    @Data public static class PendingAction {private String taskId,stepId,previewToken; private Long expiresAt;}
    @Data public static class PublicWorkflowStep {private String stepId,requestId,kind,status,taskId,receiptRef;}
    @Data public static class PublicWorkflow {private String id; private int cursor; private List<PublicWorkflowStep> steps=new ArrayList<>();}
    @Data @JsonInclude(JsonInclude.Include.NON_NULL) public static class TurnView {
        private String turnId,status,reply; private List<Card> cards=new ArrayList<>(); private WorkspaceRef workspaceRef;
        private PendingAction pendingAction; private PublicWorkflow continuation; private boolean retryable;
    }
    @Data public static class Message {private String id,role,text;private long createdAt;private List<Card> cards=new ArrayList<>();private String turnId;}
    @Data public static class SessionView {private String sessionId;private WorkspaceRef workspaceRef;private List<Message> messages=new ArrayList<>();private String nextCursor;}
    /** Server-only state. userId is never part of model context or public responses. */
    @Data public static class SessionState {private String sessionId,workspaceId;@JsonIgnore private Long userId;private List<Message> messages=new ArrayList<>();}
    @Data public static class TurnScope {
        @JsonIgnore private Long userId;private String turnId,sessionId,workspaceId;
        private Long expectedWorkspaceRevision,expectedPlanVersion;private Set<Long> authorizedDishIds=new LinkedHashSet<>();
    }
    @Data public static class ModelContext {
        private String schemaVersion=SCHEMA_VERSION;
        private Map<String,Object> requestContext=new LinkedHashMap<>(),activeMeal=new LinkedHashMap<>(),constraints=new LinkedHashMap<>(),conversation=new LinkedHashMap<>();
        private List<Map<String,Object>> lastActions=new ArrayList<>(),references=new ArrayList<>(),recentActual=new ArrayList<>();
        private Map<String,Object> calendarSnapshot=new LinkedHashMap<>(),shoppingSnapshot=new LinkedHashMap<>(),evidence=new LinkedHashMap<>();
        private List<String> capabilities=new ArrayList<>();
    }
    @Data public static class ToolRead {private String callId,name;private Map<String,Object> arguments=new LinkedHashMap<>();}
    @Data public static class ReadResult {
        private String callId,name;private List<Map<String,Object>> items=new ArrayList<>();private String nextCursor,sourceVersion;
        private boolean truncated;private List<String> unknownFields=new ArrayList<>();
    }
    @Data public static class ActionIntent {private String kind;private Map<String,Object> arguments=new LinkedHashMap<>();}
    @Data public static class ActionProposal {private List<ActionIntent> steps=new ArrayList<>();}
    /** Transient transport ONLY. Do not store this type or log its toString(). */
    @Data public static class ProviderContinuation {
        private Map<String,Object> assistantMessage=new LinkedHashMap<>();
        // Ordered, cumulative assistant/tool frames for this turn only. Last frame is assistantMessage.
        // Allows third/fourth provider calls to retain earlier tool IDs and required reasoning metadata.
        private List<Map<String,Object>> messages=new ArrayList<>();
        @Override public String toString(){return "ProviderContinuation[redacted]";}
    }
    @Data public static class ConversationFrame {private String role,content;}
    @Data public static class StepInput {
        private String schemaVersion=SCHEMA_VERSION;private ModelContext context;private String message;
        private List<ConversationFrame> conversationFrames=new ArrayList<>();private List<ReadResult> readResults=new ArrayList<>();
        private ProviderContinuation providerContinuation;private boolean finalRound;private double timeoutSeconds=10;private Long deadlineEpochMillis;
    }
    @Data public static class StepOutput {
        private String type,question,reply,factSource;private List<ToolRead> readCalls=new ArrayList<>();private ActionProposal actionProposal;
        private ProviderContinuation providerContinuation;
    }
    @Data public static class WorkflowStep {
        private String stepId,requestId,kind;private Map<String,Object> arguments=new LinkedHashMap<>();
        private List<String> dependsOn=new ArrayList<>();private String status="pending",taskId,receiptRef;
    }
    @Data public static class WorkflowContinuation {private String id;private List<WorkflowStep> steps=new ArrayList<>();private int cursor;private long revision;}
    /** Persistable result contains no transient provider state. */
    @Data public static class TurnResult {
        private String status,reply;private List<Card> cards=new ArrayList<>();private WorkspaceRef workspaceRef;
        private PendingAction pendingAction;private WorkflowContinuation continuation;private boolean retryable;
    }
    @Data public static class TurnRecord {
        private String id,sessionId,workspaceId,requestId,requestHash,status,inputJson,resultJson,continuationJson,leaseToken;
        private Long userId;private long createdAt,updatedAt,modelDeadlineAt,leaseUntil;private int providerCallsUsed;
    }
    @Data public static class SessionRecord {private String id,workspaceId,requestId,requestHash;private Long userId;private long createdAt,updatedAt;}

    public static SessionRequest parseSession(JsonNode node) {
        fields(node,"workspaceId","requestId");SessionRequest r=new SessionRequest();r.setWorkspaceId(text(node,"workspaceId",100));r.setRequestId(uuid(node));return r;
    }
    public static TurnRequest parseTurn(JsonNode node) {
        fields(node,"requestId","message","workspaceId","expectedWorkspaceRevision","expectedPlanVersion","entryScene");
        TurnRequest r=new TurnRequest();r.setRequestId(uuid(node));r.setMessage(text(node,"message",2000));r.setWorkspaceId(text(node,"workspaceId",100));
        r.setExpectedWorkspaceRevision(number(node,"expectedWorkspaceRevision"));r.setExpectedPlanVersion(number(node,"expectedPlanVersion"));
        r.setEntryScene(text(node,"entryScene",40));if(!Arrays.asList("home","calendar","chat").contains(r.getEntryScene()))throw new IllegalArgumentException("入口无效");return r;
    }
    public static void fields(JsonNode n,String... names) {
        if(n==null||!n.isObject())throw new IllegalArgumentException("请求须为对象");Set<String> allowed=new HashSet<>(Arrays.asList(names));
        n.fieldNames().forEachRemaining(k->{if(!allowed.contains(k))throw new IllegalArgumentException("请求包含不支持的字段");});
    }
    private static String text(JsonNode n,String key,int limit){JsonNode v=n.get(key);if(v==null||!v.isTextual()||v.textValue().trim().isEmpty()||v.textValue().length()>limit)throw new IllegalArgumentException("请求字段无效: "+key);return v.textValue();}
    private static long number(JsonNode n,String key){JsonNode v=n.get(key);if(v==null||!v.isIntegralNumber()||!v.canConvertToLong()||v.longValue()<0)throw new IllegalArgumentException("请求版本无效");return v.longValue();}
    private static String uuid(JsonNode n){String s=text(n,"requestId",36);if(!s.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))throw new IllegalArgumentException("请求标识须为 UUID");return s.toLowerCase(Locale.ROOT);}
    public static WorkflowContinuation workflow(String turnId,List<ActionIntent> intents) {
        if(intents==null||intents.isEmpty()||intents.size()>3)throw new IllegalArgumentException("步骤数量无效");
        WorkflowContinuation c=new WorkflowContinuation();c.setId(stable(turnId,"workflow"));
        for(int i=0;i<intents.size();i++){
            ActionIntent a=intents.get(i);if(a==null||!ACTIONS.contains(a.getKind())||a.getArguments()==null)throw new IllegalArgumentException("操作类型无效");
            WorkflowStep s=new WorkflowStep();s.setStepId("step-"+(i+1));s.setRequestId(stable(turnId,s.getStepId()));s.setKind(a.getKind());s.setArguments(new LinkedHashMap<>(a.getArguments()));
            if(i>0)s.getDependsOn().add(c.getSteps().get(i-1).getStepId());c.getSteps().add(s);
        }return c;
    }
    private static String stable(String turnId,String step){return UUID.nameUUIDFromBytes(("e77ed89c-e3bd-433f-b00b-a979a2694268|"+turnId+"|"+step).getBytes(StandardCharsets.UTF_8)).toString();}
    public static PublicWorkflow publicWorkflow(WorkflowContinuation c){
        if(c==null)return null;PublicWorkflow p=new PublicWorkflow();p.setId(c.getId());p.setCursor(c.getCursor());
        for(WorkflowStep s:c.getSteps()){PublicWorkflowStep v=new PublicWorkflowStep();v.setStepId(s.getStepId());v.setRequestId(s.getRequestId());v.setKind(s.getKind());v.setStatus(s.getStatus());v.setTaskId(s.getTaskId());v.setReceiptRef(s.getReceiptRef());p.getSteps().add(v);}return p;
    }
}
