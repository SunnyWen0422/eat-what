package com.eatwhat.controller;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.service.MealConsumptionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.Collections;

@RestController
public class MealConsumptionController {
    private final MealConsumptionService service;
    public MealConsumptionController(MealConsumptionService service){this.service=service;}
    private Long user(HttpServletRequest request){Object id=request.getAttribute("currentUserId");if(!(id instanceof Long))throw new IllegalArgumentException("用户未登录");return (Long)id;}
    @GetMapping("/recipe-records/overview")
    public Object overview(@RequestParam String startDate,@RequestParam String endDate,HttpServletRequest request){return service.overview(user(request),startDate,endDate);}
    @GetMapping("/diet-reviews")
    public Object review(@RequestParam String startDate,@RequestParam String endDate,HttpServletRequest request){return service.review(user(request),startDate,endDate);}
    @PutMapping("/meal-consumptions/{date}/{mealType}")
    public Object save(@PathVariable String date,@PathVariable String mealType,@RequestBody MealConsumptionRequest body,HttpServletRequest request){return service.save(user(request),date,mealType,body);}
    @ExceptionHandler(MealConsumptionService.VersionConflict.class)
    public ResponseEntity<?> conflict(MealConsumptionService.VersionConflict e){return ResponseEntity.status(409).body(Collections.singletonMap("message",e.getMessage()));}
}
