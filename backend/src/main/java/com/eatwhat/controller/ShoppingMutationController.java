package com.eatwhat.controller;
import com.eatwhat.dto.*;
import com.eatwhat.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/shopping-list")
public class ShoppingMutationController {
    private final ShoppingMutationService service;
    public ShoppingMutationController(ShoppingMutationService service){this.service=service;}
    private Long user(HttpServletRequest request){return (Long)request.getAttribute("currentUserId");}
    @PostMapping("/manual-items") public Object manual(@RequestBody ShoppingManualRequest body,HttpServletRequest request){return service.manual(user(request),body);}
    @PostMapping("/items:batch-check") public Object check(@RequestBody ShoppingCheckRequest body,HttpServletRequest request){return service.check(user(request),body);}
    @PatchMapping("/items/{id}/confirmed") public Object patch(@PathVariable Long id,@RequestBody ShoppingItemPatchRequest body,HttpServletRequest request){return service.patch(user(request),id,body);}
    @PostMapping("/items/{id}:delete") public Object delete(@PathVariable Long id,@RequestBody ShoppingItemPatchRequest body,HttpServletRequest request){return service.delete(user(request),id,body);}
    @ExceptionHandler(ShoppingListService.VersionConflictException.class) public ResponseEntity<?> conflict(ShoppingListService.VersionConflictException e){Map<String,Object> body=new LinkedHashMap<>();body.put("message",e.getMessage());body.put("serverVersion",e.getServerVersion());return ResponseEntity.status(409).body(body);}
    @ExceptionHandler(MealConsumptionService.VersionConflict.class) public ResponseEntity<?> conflict(MealConsumptionService.VersionConflict e){return ResponseEntity.status(409).body(Collections.singletonMap("message",e.getMessage()));}
}
