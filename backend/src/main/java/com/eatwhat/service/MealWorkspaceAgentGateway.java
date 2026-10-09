package com.eatwhat.service;
import com.eatwhat.dto.MealWorkspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import java.util.*;
@Service
public class MealWorkspaceAgentGateway {
    @org.springframework.beans.factory.annotation.Autowired
    private WorkspaceAgentContextService taskContext;
    private final String baseUrl;
    private final String token;
    private final RestTemplate http;
    private final AiProtectionService protection;
    private final ObjectMapper json;
    public MealWorkspaceAgentGateway(@Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl,
            @Value("${meal-workspace.service-token:}") String token,AiProtectionService protection,ObjectMapper json) {
        this.baseUrl=baseUrl.replaceAll("/+$","");this.token=token;this.protection=protection;this.json=json;
        SimpleClientHttpRequestFactory factory=new SimpleClientHttpRequestFactory();factory.setConnectTimeout(1000);factory.setReadTimeout(14000);http=new RestTemplate(factory);
    }
    @SuppressWarnings("unchecked")
    public Map<String,Object> run(Long user,MealWorkspace w) {
        if(token.trim().isEmpty())throw new IllegalStateException("智能理解尚未配置");
        AiProtectionService.Decision decision=protection.acquire(user,"workspace",w.getContext().getRequirements().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        if(!decision.isAllowed())throw new IllegalStateException("智能理解请求较多，请稍后重试");
        try {
            Map<String,Object> body=json.convertValue(w,Map.class);
            if(taskContext!=null){Map<String,Object> context=taskContext.build(user,w);body.put("agentContext",context);body.put("recommendationOptions",context.get("recommendationOptions"));}
            Map<String,Object> payload=new LinkedHashMap<>();payload.put("workspace",body);payload.put("userId",user);
            HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);headers.set("X-Service-Token",token);
            String response=http.postForObject(baseUrl+"/internal/v4/meal-task",new HttpEntity<>(payload,headers),String.class);
            return json.readValue(response,Map.class);
        } catch(Exception e) {throw new IllegalStateException("智能理解暂不可用，请在设置面板明确限制后重试");}
        finally {protection.release();}
    }
}
