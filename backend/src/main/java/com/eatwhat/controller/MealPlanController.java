package com.eatwhat.controller;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.service.MealPlanService;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
@RestController
@RequestMapping("/meal-plans")
public class MealPlanController {
    private final MealPlanService service;
    public MealPlanController(MealPlanService service){this.service=service;}
    @PutMapping("/{date}/{meal}") public Object save(@PathVariable String date,@PathVariable String meal,@RequestBody RecipeRecord body,HttpServletRequest request){return service.mutate((Long)request.getAttribute("currentUserId"),date,meal,body,false);}
    @DeleteMapping("/{date}/{meal}") public Object remove(@PathVariable String date,@PathVariable String meal,@RequestBody RecipeRecord body,HttpServletRequest request){return service.mutate((Long)request.getAttribute("currentUserId"),date,meal,body,true);}
}
