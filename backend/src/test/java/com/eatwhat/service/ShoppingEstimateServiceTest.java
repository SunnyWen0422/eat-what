package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.mapper.IngredientPriceMapper;
import com.eatwhat.util.ShoppingIngredientKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ShoppingEstimateServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private JsonNode fixture() throws Exception {
        Path path = Paths.get("tests/fixtures/shopping-estimates.json");
        if (!Files.exists(path)) path = Paths.get("../tests/fixtures/shopping-estimates.json");
        return json.readTree(Files.readAllBytes(path));
    }
    private <T> T merged(JsonNode base, JsonNode override, Class<T> type) throws Exception {
        ObjectNode copy = base.deepCopy();
        if (override != null) copy.setAll((ObjectNode) override);
        return json.treeToValue(copy, type);
    }
    private ShoppingListResponse list(ShoppingPreviewItemDTO... items) {
        ShoppingListResponse list = new ShoppingListResponse();
        ShoppingDishDTO dish = new ShoppingDishDTO(); dish.setDishId(1L); dish.setItems(Arrays.asList(items));
        list.setDishes(Collections.singletonList(dish)); return list;
    }

    @Test void exactJsJavaEligibilityDateUnitsSpecificationsAndRounding() throws Exception {
        JsonNode fixture = fixture();
        for (JsonNode example : fixture.path("cases")) {
            ShoppingPreviewItemDTO item = merged(fixture.path("baseItem"), example.get("item"), ShoppingPreviewItemDTO.class);
            IngredientQuote quote = merged(fixture.path("baseQuote"), example.get("quote"), IngredientQuote.class);
            Long expected = example.path("expectedCents").isNull() ? null : example.path("expectedCents").longValue();
            assertEquals(expected, ShoppingEstimateService.estimate(item, quote, LocalDate.parse(fixture.path("today").asText())), example.path("name").asText());
        }
    }

    @Test void exactJsJavaSummaryPartialKnownCoverageActualZeroAndNoMutation() throws Exception {
        JsonNode fixture = fixture();
        List<ShoppingPreviewItemDTO> items = new ArrayList<>();
        for (JsonNode item : fixture.path("summary").path("items")) items.add(merged(fixture.path("baseItem"), item, ShoppingPreviewItemDTO.class));
        ShoppingListResponse list = list(items.toArray(new ShoppingPreviewItemDTO[0]));
        ShoppingExpense actual = new ShoppingExpense(); actual.setAmount(java.math.BigDecimal.ZERO);
        list.getExpenses().put(ShoppingIngredientKey.of(items.get(0)), actual);
        String before = json.writeValueAsString(list);
        Map<String, IngredientQuote> quotes = Collections.singletonMap(ShoppingIngredientKey.of(items.get(0)), json.treeToValue(fixture.path("baseQuote"), IngredientQuote.class));
        Map<String, Object> result = ShoppingEstimateService.summarize(list, quotes, LocalDate.parse(fixture.path("today").asText()));
        assertEquals(fixture.path("summary").path("expected"), json.readTree(json.writeValueAsBytes(result)));
        assertEquals(before, json.writeValueAsString(list));
        assertEquals(java.math.BigDecimal.ZERO, actual.getAmount());
        Map<String, Object> complete = ShoppingEstimateService.summarize(list(items.get(0)), quotes, LocalDate.parse(fixture.path("today").asText()));
        assertEquals(true, complete.get("complete")); assertEquals(360L, complete.get("totalCents"));
        Map<String, Object> empty = ShoppingEstimateService.summarize(list(), quotes, LocalDate.parse(fixture.path("today").asText()));
        assertEquals(false, empty.get("complete")); assertNull(empty.get("knownSubtotalCents")); assertNull(empty.get("totalCents"));
    }

    @Test void ownedReadUsesBoundedQueriesAndFailureCannotBecomeZeroOrMutateList() throws Exception {
        ShoppingListService shopping = mock(ShoppingListService.class);
        ShanghaiPriceService prices = mock(ShanghaiPriceService.class);
        ShoppingListResponse list = new ShoppingListResponse();
        ShoppingDishDTO dish = new ShoppingDishDTO(); dish.setDishId(1L);
        for (int index = 0; index < 501; index++) {
            ShoppingPreviewItemDTO item = new ShoppingPreviewItemDTO(); item.setCanonicalName("食材" + index); dish.getItems().add(item);
        }
        list.getDishes().add(dish); when(shopping.getList(31L, "all")).thenReturn(list);
        when(prices.query(anyList())).thenReturn(Collections.emptyMap());
        ShoppingEstimateService service = new ShoppingEstimateService(shopping, prices);
        Map<String, Object> result = service.summarize(31L);
        assertEquals(501, result.get("missingCount")); assertNull(result.get("knownSubtotalCents")); assertEquals(true, result.get("serviceAvailable"));
        org.mockito.ArgumentCaptor<List<IngredientQuote>> batches = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(prices, times(2)).query(batches.capture());
        assertEquals(500, batches.getAllValues().get(0).size()); assertEquals(1, batches.getAllValues().get(1).size());
        String before = json.writeValueAsString(list);
        when(prices.query(anyList())).thenThrow(new IllegalStateException("offline fixture"));
        Map<String, Object> failed = service.summarize(31L);
        assertEquals(false, failed.get("serviceAvailable")); assertEquals(501, failed.get("missingCount")); assertNull(failed.get("totalCents"));
        assertEquals(before, json.writeValueAsString(list));
        verify(shopping, times(2)).getList(31L, "all"); verifyNoMoreInteractions(shopping);
        assertThrows(IllegalArgumentException.class, () -> service.summarize((Long) null));
    }

    @Test void subtotalKeepsTheSameExactIntegerBoundaryAsJs() throws Exception {
        JsonNode fixture = fixture(), limit = fixture.path("numericBoundary");
        ShoppingPreviewItemDTO item = merged(fixture.path("baseItem"), limit.path("item"), ShoppingPreviewItemDTO.class);
        IngredientQuote quote = merged(fixture.path("baseQuote"), limit.path("quote"), IngredientQuote.class);
        ShoppingPreviewItemDTO[] items = new ShoppingPreviewItemDTO[limit.path("repeat").asInt()]; Arrays.fill(items, item);
        Map<String, Object> summary = ShoppingEstimateService.summarize(list(items), Collections.singletonMap(ShoppingIngredientKey.of(item), quote), LocalDate.parse(fixture.path("today").asText()));
        assertEquals(limit.path("coveredCount").asInt(), summary.get("coveredCount")); assertEquals(limit.path("missingCount").asInt(), summary.get("missingCount"));
        assertEquals(limit.path("knownSubtotalCents").asLong(), summary.get("knownSubtotalCents")); assertNull(summary.get("totalCents"));
    }

    @Test void officialQueryEchoesExactMappedIdentityAndInvalidDateIsUnknown() {
        IngredientPriceMapper mapper = mock(IngredientPriceMapper.class);
        IngredientQuote stored = new IngredientQuote(); stored.setSourceName("官方品名"); stored.setVariant("官方规格"); stored.setQuoteDate("2026-02-30");
        when(mapper.latest("番茄", "精确规格")).thenReturn(stored);
        IngredientQuote request = new IngredientQuote(); request.setCanonicalName("番茄"); request.setNormalizedVariant("精确规格"); request.setIngredientKey("exact-key");
        IngredientQuote result = new ShanghaiPriceService(mapper, mock(ShanghaiPriceParser.class)).query(Collections.singletonList(request)).get("exact-key");
        assertEquals("MISSING", result.getStatus()); assertEquals("番茄", result.getCanonicalName()); assertEquals("精确规格", result.getNormalizedVariant());
        assertEquals("官方品名", result.getSourceName()); assertEquals("官方规格", result.getVariant());
        verify(mapper).latest("番茄", "精确规格");
    }
}
