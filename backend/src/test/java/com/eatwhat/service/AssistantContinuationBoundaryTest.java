package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AssistantContinuationBoundaryTest {
 @Test void production_null_policy_survives_three_python_tool_rounds_without_weakening_integrity() throws Exception {
  String python=System.getProperty("recommendation.python");Assumptions.assumeTrue(python!=null);
  ObjectMapper application=new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
  RestTemplate http=new RestTemplate();MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
  for(int n=0;n<3;n++)server.expect(requestTo("http://localhost/internal/v4/assistant/step")).andRespond(request->{
   try {
    String payload=((MockClientHttpRequest)request).getBodyAsString();
    if(application.readTree(payload).path("readResults").size()>0)assertTrue(application.readTree(payload).path("readResults").get(0).has("nextCursor"));
    String script=Paths.get("../scripts/check_assistant_continuation_boundary.py").toAbsolutePath().normalize().toString();
    Process process=new ProcessBuilder(python,script).redirectErrorStream(true).start();
    try(java.io.OutputStream input=process.getOutputStream()){input.write(payload.getBytes(StandardCharsets.UTF_8));}
    byte[] output=process.getInputStream().readAllBytes();assertTrue(process.waitFor(30,TimeUnit.SECONDS));assertEquals(0,process.exitValue(),new String(output,StandardCharsets.UTF_8));
    return withSuccess(new String(output,StandardCharsets.UTF_8),MediaType.APPLICATION_JSON).createResponse(request);
   }catch(Exception error){throw new java.io.IOException(error);}
  });
  AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","synthetic-only",application,timeout->http);
  AssistantV4TurnService validator=new AssistantV4TurnService(null,null,new AssistantCapabilityService(true),null,null,null,application,Clock.systemUTC(),Runnable::run);
  StepInput input=new StepInput();input.setContext(new ModelContext());input.getContext().getCapabilities().add("get_recommendation_options");input.setMessage("偏清淡");input.setTimeoutSeconds(20);
  try {
   for(int round=1;round<=3;round++) {
    input.setDeadlineEpochMillis(null);StepOutput output=gateway.step(input);
    ReflectionTestUtils.invokeMethod(validator,"validateContinuation",output.getProviderContinuation(),output.getReadCalls(),input.getProviderContinuation(),input.getReadResults());
    if(round==3) {
     output.getProviderContinuation().getMessages().get(1).put("content","{}");
     assertThrows(IllegalArgumentException.class,()->ReflectionTestUtils.invokeMethod(validator,"validateContinuation",output.getProviderContinuation(),output.getReadCalls(),input.getProviderContinuation(),input.getReadResults()));
    }
    input.setProviderContinuation(output.getProviderContinuation());ReadResult read=new ReadResult();read.setCallId("wire-"+round);read.setName("get_recommendation_options");read.getItems().add(Collections.singletonMap("group","flavor"));input.setReadResults(Collections.singletonList(read));
   }
   server.verify();assertFalse(application.writeValueAsString(new ReadResult()).contains("nextCursor"));
  }finally{gateway.close();validator.close();}
 }
}
