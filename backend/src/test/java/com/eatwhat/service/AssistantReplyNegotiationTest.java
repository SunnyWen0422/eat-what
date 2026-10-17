package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.MediaType;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
class AssistantReplyNegotiationTest {
 @Test void old_python_404_keeps_legacy_flow_and_probe_is_cached(){
  RestTemplate http=new RestTemplate();MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
  server.expect(requestTo("http://localhost/internal/v4/assistant/reply-capabilities")).andExpect(header("X-Service-Token","synthetic")).andRespond(withStatus(org.springframework.http.HttpStatus.NOT_FOUND));
  server.expect(requestTo("http://localhost/internal/v4/assistant/step")).andRespond(withSuccess("{\"type\":\"final\",\"reply\":\"旧回复\"}",MediaType.APPLICATION_JSON));
  AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","synthetic",new ObjectMapper(),timeout->http);
  try{assertFalse(gateway.supportsNaturalReplies());gateway.configureNaturalReplies(true);assertFalse(gateway.supportsNaturalReplies());assertFalse(gateway.supportsNaturalReplies());assertEquals("旧回复",gateway.step(new StepInput()).getReply());server.verify();}finally{gateway.close();}
 }
 @Test void exact_contract_is_required_and_disable_takes_effect(){
  RestTemplate http=new RestTemplate();MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
  server.expect(requestTo("http://localhost/internal/v4/assistant/reply-capabilities")).andRespond(withSuccess("{\"replyContracts\":[\"meal_reply.v1\"]}",MediaType.APPLICATION_JSON));
  AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","synthetic",new ObjectMapper(),timeout->http);
  try{gateway.configureNaturalReplies(true);assertTrue(gateway.supportsNaturalReplies());assertTrue(gateway.supportsNaturalReplies());gateway.configureNaturalReplies(false);assertFalse(gateway.supportsNaturalReplies());server.verify();}finally{gateway.close();}
 }
}
