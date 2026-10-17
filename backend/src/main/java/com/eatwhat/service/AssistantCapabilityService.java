package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Registrations must hold actual executable implementations; a feature flag alone is insufficient. */
@Service
public class AssistantCapabilityService {
    public interface TurnExecutor {void enqueue(Long user,String turnId);}
    public interface ReadExecutor {ReadResult read(Long user,ToolRead call,TurnScope scope);}
    public interface ActionExecutor {TurnResult execute(Long user,WorkflowStep step,TurnScope scope);}
    private final boolean enabled;
    private volatile boolean extensionsEnabled;
    private java.util.function.Supplier<Boolean> extensionProbe=()->false;
    private java.util.function.Supplier<Boolean> naturalReplyProbe=()->false;
    private final Set<String> uiFeatures=ConcurrentHashMap.newKeySet();
    private volatile TurnExecutor turns;
    private final Map<String,ReadExecutor> reads=new ConcurrentHashMap<>();
    private final Map<String,ActionExecutor> drafts=new ConcurrentHashMap<>(),previews=new ConcurrentHashMap<>();
    public AssistantCapabilityService(@Value("${assistant-v4.enabled:${ASSISTANT_V4_ENABLED:false}}") boolean enabled){this.enabled=enabled;}
    @org.springframework.beans.factory.annotation.Autowired
    void setupExtensions(@Value("${assistant-v4.extensions-enabled:${ASSISTANT_V4_EXTENSIONS_ENABLED:false}}") boolean allowed,AssistantV4ModelGateway gateway){configureExtensions(allowed,gateway::supportsExtensions);naturalReplyProbe=gateway::supportsNaturalReplies;}
    public void configureExtensions(boolean allowed,java.util.function.Supplier<Boolean> probe){extensionsEnabled=allowed;extensionProbe=Objects.requireNonNull(probe);}
    public void registerUiFeature(String name){if(!com.eatwhat.dto.AssistantV4Contract.UI_FEATURES.contains(name)||!uiFeatures.add(name))throw new IllegalArgumentException("unsupported or duplicate UI feature");}
    public synchronized void registerTurnExecutor(TurnExecutor executor){if(executor==null||turns!=null)throw new IllegalStateException("turn executor already registered or null");turns=executor;}
    public void registerRead(String name,ReadExecutor executor){if(!Arrays.asList("search_dishes","search_by_ingredients","get_dish_details","get_dish_methods","read_current_meal","read_calendar","read_shopping","read_actual_diet_review").contains(name)&&!AssistantPersonalReadService.READS.contains(name))throw new IllegalArgumentException("unsupported read");register(reads,name,executor);}
    public void registerDraft(String name,ActionExecutor executor){if(!"draft_update".equals(name))throw new IllegalArgumentException("unsupported draft");register(drafts,name,executor);}
    public void registerPreview(String name,ActionExecutor executor){if(!Arrays.asList("calendar_save","shopping_preview").contains(name))throw new IllegalArgumentException("unsupported preview");register(previews,name,executor);}
    private <T> void register(Map<String,T> map,String name,T executor){if(name==null||executor==null||map.putIfAbsent(name,executor)!=null)throw new IllegalArgumentException("duplicate or empty executor");}
    public Capabilities capabilities(){Capabilities c=new Capabilities();c.setEnabled(enabled&&turns!=null&&!reads.isEmpty());if(c.isEnabled()){boolean extended=extensionsEnabled&&Boolean.TRUE.equals(extensionProbe.get());List<String> available=sorted(reads);if(!extended)available.removeAll(AssistantPersonalReadService.READS);c.setReads(available);c.setDraftCommands(sorted(drafts));c.setPreviewActions(sorted(previews));if(extended){List<String> values=new ArrayList<>(uiFeatures);if(!naturalReplyProbe.get())values.remove("meal_requirements_v1");Collections.sort(values);c.setSupportedUiFeatures(values);}}return c;}
    public void requireUiFeatures(List<String> requested){if(requested!=null&&!requested.isEmpty()&&!capabilities().getSupportedUiFeatures().containsAll(requested))throw new ResponseStatusException(HttpStatus.CONFLICT,"助手能力已变化，请重新打开这段对话");}
    private List<String> sorted(Map<String,?> map){List<String> v=new ArrayList<>(map.keySet());Collections.sort(v);return v;}
    public void requireEnabled(){if(!capabilities().isEnabled())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"当前环境暂未开启助手");}
    public void enqueue(Long user,String turnId){requireEnabled();turns.enqueue(user,turnId);}
    public ReadExecutor readExecutor(String name){requireEnabled();if(!capabilities().getReads().contains(name))throw new IllegalArgumentException("不支持的查询");ReadExecutor e=reads.get(name);if(e==null)throw new IllegalArgumentException("不支持的查询");return e;}
    public ActionExecutor actionExecutor(String kind){requireEnabled();ActionExecutor e=drafts.get(kind);if(e==null)e=previews.get(kind);if(e==null)throw new IllegalArgumentException("不支持的操作");return e;}
}
