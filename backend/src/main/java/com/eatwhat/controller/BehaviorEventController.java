package com.eatwhat.controller;
import com.eatwhat.dto.BehaviorEventRequest;
import com.eatwhat.service.MealBehaviorService;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
@RestController
public class BehaviorEventController {
    private final MealBehaviorService service;
    public BehaviorEventController(MealBehaviorService service){this.service=service;}
    @PostMapping("/behavior-events") public Object record(@RequestBody BehaviorEventRequest body,HttpServletRequest request){return service.record((Long)request.getAttribute("currentUserId"),body);}
}
