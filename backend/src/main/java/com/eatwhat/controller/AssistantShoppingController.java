package com.eatwhat.controller;

import com.eatwhat.dto.AssistantShoppingContract.RepreviewRequest;
import com.eatwhat.service.*;
import com.fasterxml.jackson.databind.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/assistant/v4/shopping/tasks")
public class AssistantShoppingController {
 private final ShoppingAssistantToolAdapter shopping;private final AssistantCapabilityService capabilities;private final ObjectMapper json;
 public AssistantShoppingController(ShoppingAssistantToolAdapter shopping,AssistantCapabilityService capabilities,ObjectMapper json){this.shopping=shopping;this.capabilities=capabilities;this.json=json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,true);}
 @PostMapping("/{taskId}/repreview") public Object repreview(@PathVariable String taskId,@RequestBody Map<String,Object> body,HttpServletRequest request){
  capabilities.requireEnabled();Object id=request.getAttribute("currentUserId");if(!(id instanceof Number)||((Number)id).longValue()<1)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录");
  for(String key:body.keySet())if(!java.util.Arrays.asList("requestId","selectedSourceKeys","excludedOwnedIngredients").contains(key))throw new IllegalArgumentException("不支持的采购参数");
  ControlledToolRegistry.string(body,"requestId");return shopping.repreview(((Number)id).longValue(),taskId,json.convertValue(body,RepreviewRequest.class));
 }
}
