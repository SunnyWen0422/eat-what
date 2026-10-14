package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.MediaType;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AssistantV4ModelBudgetTest {
    @Test void longer_outer_budget_is_forwarded_once_and_bounds_transport() {
        RestTemplate http=new RestTemplate();AtomicInteger outerMillis=new AtomicInteger();
        MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
        server.expect(requestTo("http://localhost/internal/v4/assistant/step"))
            .andExpect(jsonPath("$.timeoutSeconds").value(23.0))
            .andExpect(jsonPath("$.deadlineEpochMillis").isNumber())
            .andRespond(withSuccess("{\"type\":\"final\",\"reply\":\"ok\"}",MediaType.APPLICATION_JSON));
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),millis->{outerMillis.set(millis);return http;});
        StepInput input=new StepInput();input.setTimeoutSeconds(23);
        try {assertEquals("final",gateway.step(input).getType());assertEquals(23000,outerMillis.get());server.verify();}
        finally {gateway.close();}
    }
    @Test void expired_absolute_deadline_never_starts_transport() {
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),millis->{throw new AssertionError("transport must not start");});
        StepInput input=new StepInput();input.setTimeoutSeconds(23);input.setDeadlineEpochMillis(System.currentTimeMillis()-1);
        try {assertThrows(IllegalArgumentException.class,()->gateway.step(input));}finally {gateway.close();}
    }
    @Test void budgets_without_provider_and_network_headroom_never_start_transport() {
        AssistantV4ModelGateway gateway=new AssistantV4ModelGateway("http://localhost","test-only",new ObjectMapper(),millis->{throw new AssertionError("transport must not start");});
        try {for(double timeout:new double[]{.1,3.49,23.01,Double.POSITIVE_INFINITY}){StepInput input=new StepInput();input.setTimeoutSeconds(timeout);assertThrows(IllegalArgumentException.class,()->gateway.step(input));}}
        finally {gateway.close();}
    }
}
