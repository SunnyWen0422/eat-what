package com.eatwhat.controller;
import com.eatwhat.dto.*;
import com.eatwhat.service.MealWorkspaceService;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.servlet.http.HttpServletRequest;
import java.util.*;
@RestController
@RequestMapping("/meal-workspaces")
public class MealWorkspaceController {
    private final MealWorkspaceService service;
    private final boolean enabled;
    public MealWorkspaceController(MealWorkspaceService service,@Value("${meal-workspace.enabled:false}") boolean enabled){this.service=service;this.enabled=enabled;}
    private Long user(HttpServletRequest r){if(!enabled)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"当前环境尚未开启 V4 工作区");return (Long)r.getAttribute("currentUserId");}
    @GetMapping("/current") public Object current(@RequestParam String date,@RequestParam String mealType,HttpServletRequest r){Long user=user(r);return service.linked(user,service.current(user,date,mealType),date,mealType);}
    @PostMapping public Object create(@RequestBody WorkspaceRequest body,HttpServletRequest r){Long u=user(r);return service.presentation(u,service.create(u,body));}
    @PatchMapping("/{id}/context") public Object context(@PathVariable String id,@RequestBody WorkspaceRequest body,HttpServletRequest r){Long u=user(r);return service.presentation(u,service.mutate(u,id,"context",body));}
    @PostMapping("/{id}/commands") public Object command(@PathVariable String id,@RequestBody WorkspaceRequest body,HttpServletRequest r){Long u=user(r);return service.presentation(u,service.mutate(u,id,"command",body));}
    @PostMapping("/{id}/confirm") public Object confirm(@PathVariable String id,@RequestBody WorkspaceRequest body,HttpServletRequest r){Long u=user(r);return service.presentation(u,service.mutate(u,id,"confirm",body));}
    @GetMapping("/{id}/tasks/{taskId}") public Object task(@PathVariable String id,@PathVariable String taskId,HttpServletRequest r){return service.task(user(r),id,taskId);}
    @GetMapping("/{id}/requests/{requestId}") public Object request(@PathVariable String id,@PathVariable String requestId,HttpServletRequest r){Long u=user(r);return service.presentation(u,service.request(u,id,requestId));}
}
