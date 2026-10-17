package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import org.springframework.http.MediaType;
class AssistantV4ModelGatewayTest {
 @Test void cancellation_closes_real_loopback_transport_and_releases_both_http_slots() throws Exception {cancelLoopback(false);}
 @Test void cancellation_closes_slow_response_body_and_releases_both_http_slots() throws Exception {cancelLoopback(true);}
 private void cancelLoopback(boolean slowBody) throws Exception {
  java.util.concurrent.CountDownLatch entered=new java.util.concurrent.CountDownLatch(2),release=new java.util.concurrent.CountDownLatch(1);
  java.util.concurrent.atomic.AtomicInteger calls=new java.util.concurrent.atomic.AtomicInteger();
  com.sun.net.httpserver.HttpServer server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
  java.util.concurrent.ExecutorService handlers=java.util.concurrent.Executors.newCachedThreadPool();server.setExecutor(handlers);
  server.createContext("/internal/v4/assistant/step",exchange->{try{if(calls.incrementAndGet()<=2){if(slowBody){exchange.sendResponseHeaders(200,100);exchange.getResponseBody().write(123);exchange.getResponseBody().flush();}entered.countDown();release.await();if(slowBody)return;}byte[] bytes="{\"type\":\"final\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}finally{exchange.close();}});server.start();
  AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://127.0.0.1:"+server.getAddress().getPort(),"test-only",new ObjectMapper());
  Runnable invoke=()->{StepInput in=new StepInput();in.setTimeoutSeconds(23);try{gateway.step(in);}catch(IllegalStateException expected){}};
  Thread a=new Thread(invoke),b=new Thread(invoke);
  try{
   a.start();b.start();assertTrue(entered.await(3,java.util.concurrent.TimeUnit.SECONDS));a.interrupt();b.interrupt();a.join(1500);b.join(1500);assertFalse(a.isAlive());assertFalse(b.isAlive());
   java.util.concurrent.ThreadPoolExecutor transport=(java.util.concurrent.ThreadPoolExecutor)org.springframework.test.util.ReflectionTestUtils.getField(gateway,"requests");
   long end=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(2);while(transport.getActiveCount()>0&&System.nanoTime()<end)Thread.sleep(10);
   assertEquals(0,transport.getActiveCount(),"cancelled HTTP reads must release actual transport slots");
   StepInput next=new StepInput();next.setTimeoutSeconds(4);assertEquals("final",gateway.step(next).getType());assertEquals(3,calls.get());
  }finally{release.countDown();gateway.close();server.stop(0);handlers.shutdownNow();a.join(3000);b.join(3000);handlers.awaitTermination(3,java.util.concurrent.TimeUnit.SECONDS);}
 }
 @Test void default_transport_neither_retries_failures_nor_follows_redirects() throws Exception {
  java.util.concurrent.atomic.AtomicInteger attempts=new java.util.concurrent.atomic.AtomicInteger(),status=new java.util.concurrent.atomic.AtomicInteger(503);
  com.sun.net.httpserver.HttpServer server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/",exchange->{attempts.incrementAndGet();exchange.getResponseHeaders().set("Location","/must-not-follow");exchange.sendResponseHeaders(status.get(),-1);exchange.close();});server.start();
  AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://127.0.0.1:"+server.getAddress().getPort(),"test-only",new ObjectMapper());
  try{StepInput in=new StepInput();in.setTimeoutSeconds(4);assertThrows(IllegalStateException.class,()->gateway.step(in));assertEquals(1,attempts.get());status.set(302);StepInput redirect=new StepInput();redirect.setTimeoutSeconds(4);assertThrows(IllegalStateException.class,()->gateway.step(redirect));assertEquals(2,attempts.get());}
  finally{gateway.close();server.stop(0);}
 }
 @Test void exact_route_token_and_timeout_contract(){RestTemplate http=new RestTemplate();MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();server.expect(requestTo("http://localhost/internal/v4/assistant/step")).andExpect(header("X-Service-Token","test-only")).andExpect(jsonPath("$.timeoutSeconds").value(5.5)).andRespond(withSuccess("{\"type\":\"final\",\"reply\":\"已完成\"}",MediaType.APPLICATION_JSON));StepInput in=new StepInput();in.setTimeoutSeconds(5.5);in.setContext(new ModelContext());assertEquals("final",new AssistantV4ModelGateway("http://localhost/","test-only",new ObjectMapper(),timeout->http).step(in).getType());server.verify();}
 @Test void blank_token_and_invalid_timeout_never_send(){AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","",new ObjectMapper(),timeout->{throw new AssertionError();});assertThrows(IllegalStateException.class,()->gateway.step(new StepInput()));}
 @Test void no_network_inside_transaction(){AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),timeout->{throw new AssertionError();});org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);try{assertThrows(IllegalStateException.class,()->gateway.step(new StepInput()));}finally{org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);}}
 @Test void nan_timeout_never_sends(){AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),timeout->{throw new AssertionError();});StepInput input=new StepInput();input.setTimeoutSeconds(Double.NaN);assertThrows(IllegalArgumentException.class,()->gateway.step(input));} @Test void transport_attempt_has_total_wall_clock_limit(){RestTemplate slow=org.mockito.Mockito.mock(RestTemplate.class);org.mockito.Mockito.when(slow.postForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq(String.class))).thenAnswer(i->{Thread.sleep(5000);return "{}";});AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),timeout->slow);StepInput input=new StepInput();input.setTimeoutSeconds(3.5);try{assertTimeout(java.time.Duration.ofSeconds(5),()->assertThrows(IllegalStateException.class,()->gateway.step(input)));org.mockito.Mockito.verify(slow,org.mockito.Mockito.times(1)).postForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq(String.class));}finally{gateway.close();}}}
