package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.StepInput;
import com.eatwhat.dto.AssistantV4Contract.StepOutput;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestTemplate;
import java.util.function.IntFunction;
import java.util.concurrent.*;
import javax.annotation.PreDestroy;

/** Single attempt transport; retries and provider state persistence are deliberately absent. */
@Service
public class AssistantV4ModelGateway {
    private final String url,token;
    private final ObjectMapper json;
    private final IntFunction<RestTemplate> transport;
    private final ExecutorService requests=new ThreadPoolExecutor(0,2,30,TimeUnit.SECONDS,new SynchronousQueue<>(),r->{Thread t=new Thread(r,"assistant-v4-http");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    @Autowired public AssistantV4ModelGateway(@Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl,
            @Value("${meal-workspace.service-token:}") String token,ObjectMapper json) {
        this(baseUrl,token,json,millis->{SimpleClientHttpRequestFactory f=new SimpleClientHttpRequestFactory();int connect=Math.max(1,Math.min(1000,millis/4));f.setConnectTimeout(connect);f.setReadTimeout(Math.max(1,millis-connect));return new RestTemplate(f);});
    }
    AssistantV4ModelGateway(String baseUrl,String token,ObjectMapper json,IntFunction<RestTemplate> transport){this.url=baseUrl.replaceAll("/+$","")+"/internal/v4/assistant/step";this.token=token;this.json=json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);this.transport=transport;}
    public StepOutput step(StepInput input){
        if(token==null||token.trim().isEmpty())throw new IllegalStateException("智能理解尚未配置");
        if(TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("不能在业务事务内调用模型");
        double timeout=input.getTimeoutSeconds();if(!Double.isFinite(timeout)||timeout<3.5||timeout>23)throw new IllegalArgumentException("请求时限无效");
        long now=System.currentTimeMillis(),millis=(long)(timeout*1000);
        if(input.getDeadlineEpochMillis()!=null)millis=Math.min(millis,input.getDeadlineEpochMillis()-now);
        if(millis<3500)throw new IllegalArgumentException("请求剩余时间不足");
        final int budgetMillis=(int)millis;final long deadlineNanos=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(millis);
        input.setTimeoutSeconds(millis/1000.0);input.setDeadlineEpochMillis(now+millis);
        HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);headers.set("X-Service-Token",token);
        Future<String> pending=null;
        try {pending=requests.submit(()->transport.apply(budgetMillis).postForObject(url,new HttpEntity<>(input,headers),String.class));String raw=pending.get(Math.max(1,deadlineNanos-System.nanoTime()),TimeUnit.NANOSECONDS);
            if(raw==null||raw.length()>350000)throw new IllegalStateException();return json.readValue(raw,StepOutput.class);
        }catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("本次请求已停止");}
        catch(Exception ignored){throw new IllegalStateException("智能理解暂不可用，请稍后重试");}
        finally{if(pending!=null&&!pending.isDone())pending.cancel(true);}
    }
    @PreDestroy public void close(){requests.shutdownNow();}
}
