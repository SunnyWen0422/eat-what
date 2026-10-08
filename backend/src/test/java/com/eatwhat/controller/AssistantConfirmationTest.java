package com.eatwhat.controller;

import com.eatwhat.service.AssistantActionService;
import com.eatwhat.service.AssistantGateway;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.eatwhat.service.MealConsumptionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.client.RestClientException;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantConfirmationTest {
    private final AssistantGateway gateway = mock(AssistantGateway.class);
    private final AssistantActionService actions = mock(AssistantActionService.class);
    private final AssistantController controller = new AssistantController(gateway, null, actions);

    private MockHttpServletRequest authenticated() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("currentUserId", 7L);
        return request;
    }
    private Map<String, Object> body() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action_type", "SAVE_CALENDAR"); body.put("plan_version", 1);
        body.put("preview_token", "preview-token"); body.put("idempotency_key", "save-one");
        return body;
    }
    private Map<String, Object> approved(boolean already) {
        Map<String, Object> action = new LinkedHashMap<>(body());
        action.put("type", action.remove("action_type"));
        action.put("plan", Collections.singletonMap("meals", Collections.emptyList()));
        action.put("payload", Collections.emptyMap());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true); result.put("already_confirmed", already); result.put("action", action);
        when(gateway.post(anyString(), anyMap())).thenReturn(AssistantGateway.GatewayResponse.of(HttpStatus.OK, result));
        return action;
    }
    private Map<String, Object> receipt() {
        Map<String, Object> receipt = new LinkedHashMap<>();
        receipt.put("success", true); receipt.put("executed", true); receipt.put("saved_count", 1);
        receipt.put("retained_count", 0); receipt.put("idempotency_key", "save-one");
        return receipt;
    }

    @Test void guestCannotConsumePreviewOrExecute() {
        approved(false);
        assertEquals(401, controller.confirmAction("session", body(), new MockHttpServletRequest()).getStatusCodeValue());
        verifyNoInteractions(gateway, actions);
    }
    @ParameterizedTest
    @ValueSource(strings = {"payload", "plan", "user_id", "unexpected", "actionType"})
    void rejectsEveryUnrecognizedFieldBeforeAuthorization(String extra) {
        approved(false);
        Map<String, Object> request = body(); request.put(extra, Collections.emptyMap());
        assertEquals(422, controller.confirmAction("session", request, authenticated()).getStatusCodeValue());
        verifyNoInteractions(gateway, actions);
    }
    @Test void rejectsNullPayloadOverrideToo() {
        approved(false);
        Map<String, Object> request = body(); request.put("payload", null);
        assertEquals(422, controller.confirmAction("session", request, authenticated()).getStatusCodeValue());
        verifyNoInteractions(gateway, actions);
    }
    @ParameterizedTest
    @ValueSource(strings = {"UPDATE_CALENDAR", "DELETE_CALENDAR", "ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST"})
    void unsupportedLegacyWritesHaveActionableConflictWithoutConsumingPreview(String type) {
        approved(false);
        Map<String, Object> request = body(); request.put("action_type", type);
        ResponseEntity<?> response = controller.confirmAction("session", request, authenticated());
        assertEquals(409, response.getStatusCodeValue());
        assertTrue(String.valueOf(response.getBody()).contains(type.contains("SHOPPING") ? "购物清单" : "日历"));
        verifyNoInteractions(gateway, actions);
    }
    @Test void missingConfirmationFieldsDoNotReachGateway() {
        approved(false);
        assertEquals(422, controller.confirmAction("session", Collections.emptyMap(), authenticated()).getStatusCodeValue());
        verifyNoInteractions(gateway, actions);
    }
    @Test void retriesAuthoritativeJavaWriteAfterPythonAlreadyConfirmed() {
        Map<String, Object> action = approved(true);
        when(actions.execute(7L, action)).thenThrow(new IllegalStateException("database unavailable")).thenReturn(receipt());
        assertEquals(500, controller.confirmAction("session", body(), authenticated()).getStatusCodeValue());
        ResponseEntity<?> replay = controller.confirmAction("session", body(), authenticated());
        assertEquals(200, replay.getStatusCodeValue());
        assertEquals(receipt(), replay.getBody());
        verify(actions, times(2)).execute(7L, action);
    }
    @Test void authenticatedOwnerIsInjectedAndOnlyJavaReceiptIsReturned() {
        Map<String, Object> action = approved(false);
        when(actions.execute(7L, action)).thenReturn(receipt());
        assertEquals(receipt(), controller.confirmAction("session", body(), authenticated()).getBody());
        Map<String, Object> expected = body(); expected.put("user_id", "7");
        verify(gateway).post("/assistant/sessions/session/actions/confirm", expected);
    }
    @ParameterizedTest
    @ValueSource(strings = {"1", "1.0", "1e0", "10e-1"})
    void equivalentJsonNumberVersionsAreNormalizedBeforeConsumingPreview(String jsonNumber) throws Exception {
        Map<String, Object> action = approved(false);
        Map<String, Object> request = body();
        request.put("plan_version", new ObjectMapper().readValue(jsonNumber, Number.class));
        when(actions.execute(7L, action)).thenReturn(receipt());
        ResponseEntity<?> response = controller.confirmAction("session", request, authenticated());
        assertEquals(200, response.getStatusCodeValue()); assertEquals(receipt(), response.getBody());
        Map<String, Object> expected = body(); expected.put("user_id", "7");
        verify(gateway).post("/assistant/sessions/session/actions/confirm", expected);
        verify(actions).execute(7L, action);
    }
    @Test void numericVersionReplyComparisonAcceptsIntegralRepresentationOnReplay() {
        Map<String, Object> action = approved(true); action.put("plan_version", 1.0);
        when(actions.execute(7L, action)).thenReturn(receipt());
        assertEquals(receipt(), controller.confirmAction("session", body(), authenticated()).getBody());
    }
    @Test void fractionalVersionCannotBeRoundedToAnApprovedInteger() {
        approved(false);
        Map<String, Object> request = body();
        request.put("plan_version", new java.math.BigDecimal("1.00000000000000001"));
        assertEquals(422, controller.confirmAction("session", request, authenticated()).getStatusCodeValue());
        verifyNoInteractions(gateway, actions);
    }
    @Test void disabledExecutionCannotReportPythonApprovalAsSuccessfulSave() {
        approved(false);
        assertEquals(503, new AssistantController(gateway).confirmAction("session", body(), authenticated()).getStatusCodeValue());
    }
    @Test void receiptConflictIsReturnedAs409() {
        Map<String, Object> action = approved(false);
        when(actions.execute(7L, action)).thenThrow(new MealConsumptionService.VersionConflict("确认内容已变化"));
        assertEquals(409, controller.confirmAction("session", body(), authenticated()).getStatusCodeValue());
    }
    @Test void gatewayOutageHasRetryable503() {
        when(gateway.post(anyString(), anyMap())).thenThrow(new RestClientException("offline"));
        assertEquals(503, controller.confirmAction("session", body(), authenticated()).getStatusCodeValue());
    }
    @Test void mismatchedAuthorizedActionCannotExecute() {
        Map<String, Object> action = approved(false); action.put("idempotency_key", "other-operation");
        assertEquals(422, controller.confirmAction("session", body(), authenticated()).getStatusCodeValue());
        verifyNoInteractions(actions);
    }
    @Test void retryCanUseFreshPreviewTokenButExecutesOriginalAuthorizedSnapshot() {
        Map<String, Object> action = approved(true);
        Map<String, Object> request = body(); request.put("preview_token", "new-preview-on-retry");
        when(actions.execute(7L, action)).thenReturn(receipt());
        assertEquals(receipt(), controller.confirmAction("session", request, authenticated()).getBody());
        verify(actions).execute(7L, action);
    }
}
