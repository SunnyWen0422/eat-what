package com.eatwhat.controller;

import com.eatwhat.dto.AssistantV4Contract;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.service.AssistantV4Store;
import com.eatwhat.service.AssistantCapabilityService;
import com.eatwhat.service.AssistantV4TurnService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import javax.servlet.http.HttpServletRequest;
import java.util.*;

@RestController @RequestMapping("/assistant/v4")
public class AssistantV4Controller {
    private final AssistantV4Store store;private final AssistantCapabilityService capabilities;
    @Autowired private ObjectProvider<AssistantV4TurnService> turnServices;
    public AssistantV4Controller(AssistantV4Store store,AssistantCapabilityService capabilities){this.store=store;this.capabilities=capabilities;}
    private Long user(HttpServletRequest request){Object user=request.getAttribute("currentUserId");if(!(user instanceof Long))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);return (Long)user;}
    @GetMapping("/capabilities") public Capabilities capabilities(HttpServletRequest request){user(request);return capabilities.capabilities();}
    @PostMapping("/sessions") public SessionView create(@RequestBody JsonNode body,HttpServletRequest request){Long u=user(request);capabilities.requireEnabled();return store.createSession(u,AssistantV4Contract.parseSession(body));}
    @GetMapping("/sessions") public SessionList sessions(@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit,HttpServletRequest request){return store.listSessions(user(request),cursor,limit);}
    @GetMapping("/sessions/{id}") public SessionView session(@PathVariable String id,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="30") int limit,HttpServletRequest request){return store.sessionView(user(request),id,cursor,limit);}
    @PostMapping("/sessions/{id}/turns") @ResponseStatus(HttpStatus.ACCEPTED) public Map<String,String> turn(@PathVariable String id,@RequestBody JsonNode body,HttpServletRequest request){Long u=user(request);capabilities.requireEnabled();TurnRequest parsed=AssistantV4Contract.parseTurn(body);capabilities.requireUiFeatures(parsed.getUiFeatures());TurnView view=store.claimTurn(u,id,parsed);if("queued".equals(view.getStatus()))capabilities.enqueue(u,view.getTurnId());Map<String,String> result=new LinkedHashMap<>();result.put("turnId",view.getTurnId());result.put("status",view.getStatus());return result;}
    @GetMapping("/turns/{id}") public TurnView turn(@PathVariable String id,HttpServletRequest request){return store.findTurn(user(request),id);}
    @PostMapping("/turns/{id}/cancel") public TurnView cancel(@PathVariable String id,HttpServletRequest request){return store.cancelTurn(user(request),id);}
    @PostMapping("/turns/{id}/resume") public TurnView resume(@PathVariable String id,HttpServletRequest request){Long u=user(request);capabilities.requireEnabled();turnServices.getObject().resumeWorkflow(u,id);return store.findTurn(u,id);}
    @DeleteMapping("/sessions/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String id,HttpServletRequest request){store.deleteSession(user(request),id);}
}
