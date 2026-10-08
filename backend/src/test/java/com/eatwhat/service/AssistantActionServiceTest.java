package com.eatwhat.service;

import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantActionServiceTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static Map<String, Object> action() {
        Map<String, Object> dish = new LinkedHashMap<>(); dish.put("id", 1); dish.put("name", "fish");
        Map<String, Object> meal = new LinkedHashMap<>();
        meal.put("date", "2026-10-20"); meal.put("meal_type", "dinner"); meal.put("dishes", Collections.singletonList(dish));
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("period", Collections.singletonMap("people", 4)); plan.put("meals", Collections.singletonList(meal));
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "SAVE_CALENDAR"); action.put("idempotency_key", "save-people");
        action.put("preview_token", "verified-token"); action.put("plan_version", 1); action.put("plan", plan);
        action.put("payload", Collections.emptyMap());
        return action;
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> plan(Map<String, Object> action) { return (Map<String, Object>) action.get("plan"); }

    /** Transactional backing-store fake: exercises the real Spring transaction interceptor, without a database. */
    private static class Store extends AbstractPlatformTransactionManager {
        final RecipeRecordService records = mock(RecipeRecordService.class);
        final MealConsumptionMapper logs = mock(MealConsumptionMapper.class);
        final List<RecipeRecord> saved = new ArrayList<>();
        final Map<String, Map<String, Object>> receipts = new LinkedHashMap<>();
        List<RecipeRecord> savedBefore;
        Map<String, Map<String, Object>> receiptsBefore;
        int failOnSave = -1;
        boolean failLog;
        int rollbacks;
        Store() {
            when(logs.lockUser(anyLong())).thenAnswer(i -> {
                assertTrue(TransactionSynchronizationManager.isActualTransactionActive(), "owner lock must be inside transaction");
                return i.getArgument(0);
            });
            when(logs.request(anyLong(), anyString())).thenAnswer(i -> receipts.get(i.getArgument(0) + ":" + i.getArgument(1)));
            when(records.saveRecipeRecordIfAbsent(any())).thenAnswer(i -> {
                if (saved.size() + 1 == failOnSave) throw new IllegalStateException("write failed");
                RecipeRecord record = i.getArgument(0); saved.add(record); return record;
            });
            when(logs.log(anyLong(), anyString(), anyString(), anyString())).thenAnswer(i -> {
                if (failLog) throw new IllegalStateException("receipt failed");
                Map<String, Object> receipt = new LinkedHashMap<>();
                receipt.put("requestHash", i.getArgument(2)); receipt.put("responseJson", i.getArgument(3));
                receipts.put(i.getArgument(0) + ":" + i.getArgument(1), receipt); return 1;
            });
        }
        AssistantActionService service() {
            AssistantActionService target = new AssistantActionService(records, logs, JSON);
            ProxyFactory proxy = new ProxyFactory(target);
            TransactionInterceptor interceptor = new TransactionInterceptor();
            interceptor.setTransactionManager(this);
            interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
            proxy.addAdvice(interceptor);
            return (AssistantActionService) proxy.getProxy();
        }
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            savedBefore = new ArrayList<>(saved); receiptsBefore = new LinkedHashMap<>(receipts);
        }
        protected void doCommit(DefaultTransactionStatus status) { }
        protected void doRollback(DefaultTransactionStatus status) {
            saved.clear(); saved.addAll(savedBefore); receipts.clear(); receipts.putAll(receiptsBefore); rollbacks++;
        }
    }

    @Test void calendarKeepsVerifiedHouseholdSizeAndExistingPreservation() {
        Store store = new Store();
        Map<String, Object> result = store.service().execute(1L, action());
        assertEquals(4, store.saved.get(0).getTargetPeople());
        assertEquals(true, store.saved.get(0).getPreserveExisting());
        assertEquals(true, result.get("executed"));
        assertEquals(1, store.receipts.size());
    }
    @Test void receiptReplaysAcrossServiceInstancesWithoutRewritingMeals() {
        Store store = new Store();
        Map<String, Object> first = store.service().execute(1L, action());
        Map<String, Object> replay = store.service().execute(1L, new TreeMap<>(action()));
        assertEquals(first, replay);
        assertEquals(1, store.saved.size());
        assertEquals(1, store.receipts.size());
    }
    @ParameterizedTest
    @ValueSource(strings = {"plan", "payload", "preview_token", "plan_version", "type"})
    void fullApprovedActionIsBoundToReceipt(String field) {
        Store store = new Store(); AssistantActionService service = store.service();
        service.execute(1L, action());
        Map<String, Object> changed = action();
        if ("plan".equals(field)) plan(changed).put("period", Collections.singletonMap("people", 5));
        else if ("payload".equals(field)) changed.put(field, Collections.singletonMap("extra", true));
        else if ("type".equals(field)) changed.put(field, "CREATE_CALENDAR");
        else changed.put(field, "plan_version".equals(field) ? 2 : "other-token");
        assertThrows(MealConsumptionService.VersionConflict.class, () -> service.execute(1L, changed));
        assertEquals(1, store.saved.size());
    }
    @Test void retainedMealsProduceAReplayableReceiptWithoutOverwriting() {
        Store store = new Store();
        doReturn(null).when(store.records).saveRecipeRecordIfAbsent(any());
        Map<String, Object> receipt = store.service().execute(1L, action());
        assertEquals(0, receipt.get("saved_count")); assertEquals(1, receipt.get("retained_count"));
        assertEquals(receipt, store.service().execute(1L, action()));
        assertTrue(store.saved.isEmpty()); assertEquals(1, store.receipts.size());
        verify(store.records, never()).saveRecipeRecord(any());
    }
    @Test void reorderedNestedMapKeysReplayTheSameApprovedSnapshot() {
        Store store = new Store(); Map<String, Object> original = action();
        Map<String, Object> receipt = store.service().execute(1L, original);
        Map<String, Object> reordered = action();
        reordered.put("plan", new TreeMap<>(plan(reordered)));
        assertEquals(receipt, store.service().execute(1L, reordered));
        assertEquals(1, store.saved.size());
    }
    @Test void malformedReceiptCannotClaimSuccessOrRepeatWrites() {
        Store store = new Store(); store.service().execute(1L, action());
        store.receipts.values().iterator().next().put("responseJson", "{\"success\":true}");
        assertThrows(IllegalStateException.class, () -> store.service().execute(1L, action()));
        assertEquals(1, store.saved.size());
    }
    @Test void missingReceiptInsertRollsBackMealWrites() {
        Store store = new Store(); doReturn(0).when(store.logs).log(anyLong(), anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, () -> store.service().execute(1L, action()));
        assertTrue(store.saved.isEmpty()); assertTrue(store.receipts.isEmpty());
    }
    @Test void sameRequestKeyIsIsolatedByAuthenticatedOwner() {
        Store store = new Store(); AssistantActionService service = store.service();
        service.execute(1L, action()); service.execute(2L, action());
        assertEquals(2, store.receipts.size());
        assertEquals(Arrays.asList(1L, 2L), Arrays.asList(store.saved.get(0).getUserId(), store.saved.get(1).getUserId()));
    }
    @Test void receiptKeyIsNamespacedAndFitsExistingColumnEvenForLongLegacyKey() {
        Store store = new Store(); Map<String, Object> action = action();
        String rawKey = String.join("", Collections.nCopies(200, "x")); action.put("idempotency_key", rawKey);
        store.receipts.put("1:" + rawKey, Collections.singletonMap("requestHash", "unrelated-operation"));
        store.service().execute(1L, action());
        assertEquals(2, store.receipts.size());
        String generated = store.receipts.keySet().stream().filter(k -> !k.equals("1:" + rawKey)).findFirst().get().substring(2);
        assertTrue(generated.length() <= 80); assertTrue(generated.startsWith("assistant-cal-"));
    }
    @SuppressWarnings("unchecked")
    @Test void laterMealFailureRollsBackEarlierMealsAndAllowsRetry() {
        Store store = new Store(); Map<String, Object> action = action();
        Map<String, Object> second = new LinkedHashMap<>(((List<Map<String, Object>>) plan(action).get("meals")).get(0));
        second.put("date", "2026-10-21");
        plan(action).put("meals", Arrays.asList(((List<?>) plan(action).get("meals")).get(0), second));
        store.failOnSave = 2;
        assertThrows(IllegalStateException.class, () -> store.service().execute(1L, action));
        assertEquals(0, store.saved.size()); assertTrue(store.receipts.isEmpty()); assertEquals(1, store.rollbacks);
        store.failOnSave = -1;
        assertEquals(2, store.service().execute(1L, action).get("saved_count"));
        assertEquals(2, store.saved.size()); assertEquals(1, store.receipts.size());
    }
    @Test void receiptFailureRollsBackMealsBeforeRetry() {
        Store store = new Store(); store.failLog = true;
        assertThrows(IllegalStateException.class, () -> store.service().execute(1L, action()));
        assertTrue(store.saved.isEmpty()); assertTrue(store.receipts.isEmpty());
        store.failLog = false;
        assertEquals(1, store.service().execute(1L, action()).get("saved_count"));
    }
    @Test void nonexistentUserCannotExecute() {
        Store store = new Store(); doReturn(null).when(store.logs).lockUser(1L);
        assertThrows(IllegalArgumentException.class, () -> store.service().execute(1L, action()));
        assertTrue(store.saved.isEmpty()); assertTrue(store.receipts.isEmpty());
    }
    @Test void emptyPlanCannotProduceSuccessfulReceipt() {
        Store store = new Store(); Map<String, Object> action = action(); plan(action).put("meals", Collections.emptyList());
        assertThrows(IllegalArgumentException.class, () -> store.service().execute(1L, action));
        assertTrue(store.receipts.isEmpty());
    }
    @Test void createCalendarAliasRemainsSupported() {
        Store store = new Store(); Map<String, Object> action = action(); action.put("type", "CREATE_CALENDAR");
        assertEquals(1, store.service().execute(1L, action).get("saved_count"));
        assertEquals(1, store.receipts.size());
    }
    @ParameterizedTest
    @ValueSource(strings = {"UPDATE_CALENDAR", "DELETE_CALENDAR", "ADD_SHOPPING_LIST", "UPDATE_SHOPPING_LIST", "DELETE_SHOPPING_LIST"})
    void directServiceCannotBypassUnsupportedMutationGate(String type) {
        Store store = new Store(); Map<String, Object> action = action(); action.put("type", type);
        assertThrows(MealConsumptionService.VersionConflict.class, () -> store.service().execute(1L, action));
        assertTrue(store.saved.isEmpty()); assertTrue(store.receipts.isEmpty());
    }
}
