package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.StepInput;
import com.eatwhat.dto.AssistantV4Contract.StepOutput;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.apache.http.client.methods.HttpUriRequest;
import org.apache.http.client.methods.HttpRequestBase;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestTemplate;
import java.util.function.IntFunction;
import java.util.concurrent.*;
import javax.annotation.PreDestroy;

/** Single attempt transport; retries and provider state persistence are deliberately absent. */
@Service
public class AssistantV4ModelGateway {
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;

    private final String url,token;
    private final ObjectMapper json;
    private final IntFunction<RestTemplate> transport;
    // Shared only by this gateway; abort closes blocked header/body reads without a cleanup thread.
    private final CloseableHttpClient httpClient=HttpClients.custom().setMaxConnTotal(2).setMaxConnPerRoute(2)
            .disableAutomaticRetries().disableRedirectHandling().disableCookieManagement().build();
    private volatile long extensionCheckUntil;
    private volatile boolean extensionReady;
    @Value("${assistant-v4.natural-reply-enabled:${ASSISTANT_V4_NATURAL_REPLY_ENABLED:false}}") private boolean naturalRepliesEnabled;
    private volatile long replyCheckUntil;
    private volatile boolean replyReady;
    public void configureNaturalReplies(boolean enabled){naturalRepliesEnabled=enabled;replyCheckUntil=0;replyReady=false;}
    public synchronized boolean supportsNaturalReplies(){
        if(!naturalRepliesEnabled||token==null||token.trim().isEmpty())return false;
        long now=System.currentTimeMillis();if(now<replyCheckUntil)return replyReady;
        boolean ready=false;Future<String> pending=null;TransportCancellation cancellation=new TransportCancellation();
        try{
            HttpHeaders headers=new HttpHeaders();headers.set("X-Service-Token",token);
            pending=requests.submit(()->transport(1000,cancellation).exchange(url.substring(0,url.length()-4)+"reply-capabilities",HttpMethod.GET,new HttpEntity<Void>(headers),String.class).getBody());
            String response=pending.get(1000,TimeUnit.MILLISECONDS);
            if(response!=null&&response.length()<2000){com.fasterxml.jackson.databind.JsonNode contracts=json.readTree(response).path("replyContracts");
                if(contracts.isArray())for(com.fasterxml.jackson.databind.JsonNode contract:contracts)if(contract.isTextual()&&"meal_reply.v1".equals(contract.asText()))ready=true;}
        }catch(InterruptedException cancelled){Thread.currentThread().interrupt();}
        catch(Exception unavailable){/* Legacy adapters keep the original assistant contract. */}
        finally{if(pending!=null&&!pending.isDone()){pending.cancel(true);cancellation.cancel();}}
        replyReady=ready;replyCheckUntil=now+60000;return ready;
    }
    private final ExecutorService requests=new ThreadPoolExecutor(0,2,30,TimeUnit.SECONDS,new SynchronousQueue<>(),r->{Thread t=new Thread(r,"assistant-v4-http");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    @Autowired public AssistantV4ModelGateway(@Value("${recommend.service.base-url:http://127.0.0.1:8000}") String baseUrl,
            @Value("${meal-workspace.service-token:}") String token,ObjectMapper json) {
        this(baseUrl,token,json,null);
    }
    AssistantV4ModelGateway(String baseUrl,String token,ObjectMapper json,IntFunction<RestTemplate> transport){this.url=baseUrl.replaceAll("/+$","")+"/internal/v4/assistant/step";this.token=token;this.json=json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);this.transport=transport;}
    /** One connection per attempt; cancellation closes the socket as well as interrupting its waiter. */
    private static final class TransportCancellation {
        private HttpRequestBase request;private boolean cancelled;
        synchronized void attach(HttpRequestBase value){if(cancelled){value.abort();throw new IllegalStateException("request cancelled");}request=value;}
        void cancel(){HttpRequestBase value;synchronized(this){cancelled=true;value=request;}if(value!=null)value.abort();}
    }
    private RestTemplate transport(int millis,TransportCancellation cancellation){
        if(transport!=null)return transport.apply(millis);
        HttpComponentsClientHttpRequestFactory factory=new HttpComponentsClientHttpRequestFactory(httpClient){
            @Override protected HttpUriRequest createHttpUriRequest(HttpMethod method,java.net.URI uri){
                HttpUriRequest request=super.createHttpUriRequest(method,uri);cancellation.attach((HttpRequestBase)request);return request;
            }
        };
        int connect=Math.max(1,Math.min(1000,millis/4));factory.setConnectTimeout(connect);factory.setConnectionRequestTimeout(connect);factory.setReadTimeout(Math.max(1,millis-connect));return new RestTemplate(factory);
    }
    /** Small authenticated protocol probe; never reaches the supplier or joins a DB transaction. */
    public synchronized boolean supportsExtensions(){
        if(token==null||token.trim().isEmpty()||TransactionSynchronizationManager.isActualTransactionActive())return false;
        long now=System.currentTimeMillis();if(now<extensionCheckUntil)return extensionReady;
        Future<String> pending=null;boolean ready=false;TransportCancellation cancellation=new TransportCancellation();
        try{
            HttpHeaders headers=new HttpHeaders();headers.set("X-Service-Token",token);
            pending=requests.submit(()->transport(1000,cancellation).exchange(url.substring(0,url.length()-4)+"capabilities",HttpMethod.GET,new HttpEntity<Void>(headers),String.class).getBody());
            String response=pending.get(1000,TimeUnit.MILLISECONDS);
            if(response!=null&&response.length()<2000){com.fasterxml.jackson.databind.JsonNode body=json.readTree(response);
                ready="maturity.2".equals(body.path("contractRevision").asText())&&body.path("uiFeatures").isArray()&&body.path("uiFeatures").toString().contains("\"clarification_v1\"")&&body.path("uiFeatures").toString().contains("\"handoff_v1\"");}
        }catch(InterruptedException cancelled){Thread.currentThread().interrupt();}
        catch(Exception unavailable){/* Old/unavailable adapters simply do not advertise extensions. */}
        finally{if(pending!=null&&!pending.isDone()){pending.cancel(true);cancellation.cancel();}}
        extensionReady=ready;extensionCheckUntil=now+(ready?60000:10000);return ready;
    }
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
        long observedStart=System.nanoTime();String observedOutcome="error";
        Future<String> pending=null;TransportCancellation cancellation=new TransportCancellation();
        try {pending=requests.submit(()->transport(budgetMillis,cancellation).postForObject(url,new HttpEntity<>(input,headers),String.class));String raw=pending.get(Math.max(1,deadlineNanos-System.nanoTime()),TimeUnit.NANOSECONDS);
            if(raw==null||raw.length()>350000)throw new IllegalStateException();StepOutput output=json.readValue(raw,StepOutput.class);observedOutcome="success";return output;
        }catch(InterruptedException interrupted){observedOutcome="cancel";Thread.currentThread().interrupt();throw new IllegalStateException("本次请求已停止");}
        catch(TimeoutException expired){observedOutcome="timeout";throw new IllegalStateException("智能理解暂不可用，请稍后重试");}
        catch(Exception ignored){observedOutcome=System.nanoTime()>=deadlineNanos?"timeout":ExperienceMetrics.failure(ignored);throw new IllegalStateException("智能理解暂不可用，请稍后重试");}
        finally{if(pending!=null&&!pending.isDone()){pending.cancel(true);cancellation.cancel();}ExperienceMetrics.observe(metrics,"model_http",observedOutcome,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-observedStart),1);}
    }
    @PreDestroy public void close(){requests.shutdownNow();try{httpClient.close();}catch(java.io.IOException ignored){/* Shutdown has already stopped admission. */}}
}
