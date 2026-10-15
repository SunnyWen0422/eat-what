package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.MediaType;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.util.*;
class AssistantContextBudgetTest {
    final ObjectMapper json=new ObjectMapper();
    String base="{\"requestId\":\"00000000-0000-4000-8000-000000000001\",\"message\":\"看看这餐\",\"workspaceId\":\"w\",\"expectedWorkspaceRevision\":0,\"expectedPlanVersion\":0,\"entryScene\":\"chat\"}";
    @Test void oldTurnsStayWireCompatibleAndUnknownUiFeaturesAreRejected()throws Exception{
        assertFalse(json.writeValueAsString(AssistantV4Contract.parseTurn(json.readTree(base))).contains("uiFeatures"));
        TurnRequest parsed=AssistantV4Contract.parseTurn(json.readTree(base.replace("}",",\"uiFeatures\":[\"clarification_v1\"]}")));
        assertEquals(Collections.singletonList("clarification_v1"),parsed.getUiFeatures());
        assertThrows(IllegalArgumentException.class,()->AssistantV4Contract.parseTurn(json.readTree(base.replace("}",",\"uiFeatures\":[\"arbitrary_write\"]}"))));
    }
    @Test void extensionRequiresBothRegistrationAndMatchingProviderContract(){
        AssistantCapabilityService cap=new AssistantCapabilityService(true);
        cap.registerTurnExecutor((u,t)->{});cap.registerRead("read_current_meal",(u,c,s)->new ReadResult());
        cap.registerUiFeature("clarification_v1");cap.configureExtensions(true,()->false);
        assertTrue(cap.capabilities().getSupportedUiFeatures().isEmpty());
        cap.configureExtensions(true,()->true);
        assertEquals(Collections.singletonList("clarification_v1"),cap.capabilities().getSupportedUiFeatures());
        cap.configureExtensions(false,()->{throw new AssertionError("disabled extension must not probe");});
        assertTrue(cap.capabilities().getSupportedUiFeatures().isEmpty());
    }
    @Test void providerExtensionProbeIsAuthenticatedAndDoesNotCallModels(){
        RestTemplate http=new RestTemplate();MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
        server.expect(requestTo("http://localhost/internal/v4/assistant/capabilities")).andExpect(header("X-Service-Token","synthetic"))
            .andRespond(withSuccess("{\"contractRevision\":\"maturity.1\",\"uiFeatures\":[\"clarification_v1\",\"handoff_v1\"]}",MediaType.APPLICATION_JSON));
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","synthetic",json,millis->http);
        try{assertTrue(gateway.supportsExtensions());assertTrue(gateway.supportsExtensions());server.verify();}finally{gateway.close();}
    }
}
