package com.eatwhat.controller;
import com.eatwhat.service.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
@RestController
@RequestMapping("/internal/catalog")
public class CanonicalCatalogController {
 private final CanonicalCatalogService catalog;private final DishQueryService dishes;private final String token;
 public CanonicalCatalogController(CanonicalCatalogService catalog,DishQueryService dishes,@Value("${meal-workspace.service-token:}") String token){this.catalog=catalog;this.dishes=dishes;this.token=token;}
 @PostMapping("/scale") public JsonNode scale(@RequestHeader(value="X-Service-Token",required=false)String supplied,@RequestBody Request request){
  if(token.trim().isEmpty()||supplied==null||!MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
  if(request.dishId==null||request.dishId<=0||request.userId!=null&&request.userId<=0)throw new IllegalArgumentException("Invalid catalog request");
  com.eatwhat.entity.Dish dish=request.userId==null?dishes.getDishById(request.dishId):dishes.getDishById(request.dishId,request.userId);
  return request.optionalOverrides==null?catalog.scale(dish,request.servings):catalog.scale(dish,request.servings,request.optionalOverrides);
 }
 public static class Request {public Long dishId,userId;public BigDecimal servings;public java.util.Map<String,Boolean> optionalOverrides;}
}
