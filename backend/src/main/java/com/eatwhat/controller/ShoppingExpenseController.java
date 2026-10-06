package com.eatwhat.controller;
import com.eatwhat.service.ShoppingMutationService;
import com.eatwhat.dto.ShoppingExpenseRequest;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
@RestController public class ShoppingExpenseController {
 private final ShoppingMutationService service;
 public ShoppingExpenseController(ShoppingMutationService service){this.service=service;}
 @PostMapping("/shopping-list/expenses") public Object save(@RequestBody ShoppingExpenseRequest body,HttpServletRequest request){return service.expense((Long)request.getAttribute("currentUserId"),body);}
 @ExceptionHandler(com.eatwhat.service.ShoppingListService.VersionConflictException.class)
 public org.springframework.http.ResponseEntity<?> conflict(RuntimeException e){return org.springframework.http.ResponseEntity.status(409).body(java.util.Collections.singletonMap("message",e.getMessage()));}
}
