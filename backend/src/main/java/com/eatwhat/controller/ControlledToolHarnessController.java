package com.eatwhat.controller;

import com.eatwhat.service.ControlledToolHarnessService;
import com.eatwhat.service.ControlledToolRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import javax.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/assistant/tool-tasks")
public class ControlledToolHarnessController {
    private final ControlledToolHarnessService service;
    private final boolean enabled;
    public ControlledToolHarnessController(ControlledToolHarnessService service,@Value("${meal-workspace.enabled:false}") boolean enabled){this.service=service;this.enabled=enabled;}
    private Long user(HttpServletRequest request) {
        if(!enabled)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"当前环境尚未开启 V4 工作区");
        Object value=request.getAttribute("currentUserId");
        if(!(value instanceof Number)||((Number)value).longValue()<1)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录");
        return ((Number)value).longValue();
    }
    @GetMapping("/tools") public Object tools(HttpServletRequest request){user(request);return ControlledToolRegistry.catalog();}
    @PostMapping("/preview") public Object preview(@RequestBody Map<String,Object> body,HttpServletRequest request){return service.preview(user(request),body);}
    @GetMapping("/by-request/{requestId}") public Object byRequest(@PathVariable String requestId,HttpServletRequest request){return service.byRequest(user(request),requestId);}
    @GetMapping("/{id}") public Object get(@PathVariable String id,HttpServletRequest request){return service.get(user(request),id);}
    @PostMapping("/{id}/confirm") public Object confirm(@PathVariable String id,@RequestBody Map<String,Object> body,HttpServletRequest request){
        Long user=user(request);ControlledToolRegistry.fields(body,"previewToken");
        return service.confirm(user,id,ControlledToolRegistry.string(body,"previewToken"));
    }
}
