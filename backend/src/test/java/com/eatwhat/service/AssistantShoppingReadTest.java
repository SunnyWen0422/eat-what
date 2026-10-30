package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.util.ShoppingIngredientKey;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantShoppingReadTest {
    static class Fixture extends AssistantReadToolTest.Fixture {
        final ShanghaiPriceService prices=mock(ShanghaiPriceService.class);
        final ShoppingEstimateService estimates=new ShoppingEstimateService(shopping,prices);
        final AtomicReference<String> quoteDate=new AtomicReference<>(LocalDate.now(ZoneId.of("Asia/Shanghai")).toString());
        final ShoppingListResponse pending=list(35,false),checked=list(1,true);
        Fixture(){
            when(shopping.getList(7L,"pending")).thenReturn(pending);
            when(shopping.getList(7L,"checked")).thenReturn(checked);
            when(prices.query(anyList())).thenAnswer(call->{Map<String,IngredientQuote> quotes=new LinkedHashMap<>();for(IngredientQuote request:(List<IngredientQuote>)call.getArgument(0)){
                IngredientQuote quote=new IngredientQuote();quote.setIngredientKey(request.getIngredientKey());quote.setCanonicalName(request.getCanonicalName());quote.setNormalizedVariant(request.getNormalizedVariant());quote.setStatus("AVAILABLE");quote.setQuoteDate(quoteDate.get());quote.setPrice(new BigDecimal("6"));quote.setUnitQuantity(new BigDecimal("500"));quote.setUnitCode("g");quote.setUnitFamily("mass");quote.setSourceUrl("https://fgw.sh.gov.cn/fixture-"+request.getCanonicalName());quote.setSourceLabel("合成官方参考价来源");quotes.put(request.getIngredientKey(),quote);
            }return quotes;});
        }
        AssistantReadToolService configured(){AssistantReadToolService service=reads();service.setShoppingEstimates(estimates);return service;}
        static ShoppingListResponse list(int count,boolean checked){
            ShoppingListResponse list=new ShoppingListResponse();list.setVersion(12L);ShoppingDishDTO group=new ShoppingDishDTO();group.setDishId(11L);group.setDishName("合成配方");group.setSourceDate("2026-10-28");group.setSourceMealType("dinner");
            for(int i=0;i<count;i++){ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();item.setId((long)i+1);item.setSourceDishId(11L);item.setDisplayName("材料"+i);item.setCanonicalName("材料"+i);item.setNormalizedVariant("");item.setQuantityValue(new BigDecimal("300"));item.setQuantityText("300克");item.setUnitCode("g");item.setUnitFamily("mass");item.setParseStatus("PARSED");item.setCalculationStatus("CALCULATED");item.setServingsVerified(true);item.setChecked(checked);group.getItems().add(item);}
            list.getDishes().add(group);return list;
        }
    }

    @Test void defaultAndExplicitFalseNeverQueryPricesAndOmitEstimateOnTheWire(){
        Fixture f=new Fixture();AssistantReadToolService service=f.configured();
        for(ToolRead call:Arrays.asList(f.call("read_shopping"),f.call("read_shopping","includePrices",false))){ReadResult read=service.read(7L,call,f.scope);assertNull(read.getPriceEstimate());assertFalse(f.json.valueToTree(read).has("priceEstimate"));assertEquals("12",read.getSourceVersion());}
        verifyNoInteractions(f.prices);verify(f.shopping,times(2)).getList(7L,"pending");verifyNoMoreInteractions(f.shopping);
    }
    @Test void paginatedPriceReadEstimatesAllPendingSourceItemsAndBoundsOnlySourceDetails(){
        Fixture f=new Fixture();ReadResult read=f.configured().read(7L,f.call("read_shopping","includePrices",true,"limit",1,"cursor","1"),f.scope);
        assertEquals(1,read.getItems().size());assertEquals(2L,read.getItems().get(0).get("id"));assertTrue(read.isTruncated());assertEquals("2",read.getNextCursor());
        Map<String,Object> price=read.getPriceEstimate();assertEquals(35,price.get("totalCount"));assertEquals(35,price.get("coveredCount"));assertEquals(0,price.get("missingCount"));assertEquals(12600L,price.get("knownSubtotalCents"));assertEquals(12600L,price.get("totalCents"));assertEquals(true,price.get("complete"));assertEquals("pending_source_items",price.get("scope"));assertEquals(8,((List<?>)price.get("sources")).size());assertEquals(true,price.get("sourcesTruncated"));
        org.mockito.ArgumentCaptor<List<IngredientQuote>> queries=org.mockito.ArgumentCaptor.forClass(List.class);verify(f.prices).query(queries.capture());assertEquals(35,queries.getValue().size());verify(f.shopping).getList(7L,"pending");verifyNoMoreInteractions(f.shopping);
    }
    @Test void checkedReadUsesSameAccountsCompletePendingListForEstimate(){
        Fixture f=new Fixture();ReadResult read=f.configured().read(7L,f.call("read_shopping","status","checked","includePrices",true),f.scope);
        assertEquals(true,read.getItems().get(0).get("checked"));assertEquals(1,read.getItems().size());assertEquals(35,read.getPriceEstimate().get("totalCount"));assertEquals(12600L,read.getPriceEstimate().get("totalCents"));
        verify(f.shopping).getList(7L,"checked");verify(f.shopping).getList(7L,"pending");verifyNoMoreInteractions(f.shopping);
    }
    @Test void priceFailurePreservesReadableListAndActualExpensesWithoutAFalseZeroTotal() throws Exception {
        Fixture f=new Fixture();ShoppingExpense actual=new ShoppingExpense();actual.setAmount(BigDecimal.ZERO);f.pending.getExpenses().put(ShoppingIngredientKey.of(f.pending.getDishes().get(0).getItems().get(0)),actual);String before=f.json.writeValueAsString(f.pending);
        when(f.prices.query(anyList())).thenThrow(new IllegalStateException("synthetic unavailable"));ReadResult read=f.configured().read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope);
        assertEquals(1,read.getItems().size());Map<String,Object> price=read.getPriceEstimate();assertEquals(false,price.get("serviceAvailable"));assertEquals(false,price.get("complete"));assertEquals(0,price.get("coveredCount"));assertEquals(35,price.get("missingCount"));assertNull(price.get("knownSubtotalCents"));assertNull(price.get("totalCents"));assertEquals(before,f.json.writeValueAsString(f.pending));assertEquals(BigDecimal.ZERO,actual.getAmount());
    }
    @Test void newerQuoteDateChangesReadVersionWithoutAListMutation(){
        Fixture f=new Fixture();AssistantReadToolService service=f.configured();ReadResult first=service.read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope);f.quoteDate.set(LocalDate.now(ZoneId.of("Asia/Shanghai")).minusDays(1).toString());ReadResult next=service.read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope);
        assertNotEquals(first.getSourceVersion(),next.getSourceVersion());assertEquals(first.getItems(),next.getItems());assertEquals(first.getPriceEstimate().get("totalCents"),next.getPriceEstimate().get("totalCents"));assertEquals(12L,f.pending.getVersion());
    }
    @Test void identityAndNonBooleanPriceFlagsAreRejectedBeforeShoppingOrPriceReads(){
        Fixture f=new Fixture();AssistantReadToolService service=f.configured();
        for(Object bad:Arrays.asList(null,"true",1,new LinkedHashMap<>()))assertThrows(IllegalArgumentException.class,()->service.read(7L,f.call("read_shopping","includePrices",bad),f.scope));
        assertThrows(IllegalArgumentException.class,()->service.read(99L,f.call("read_shopping","includePrices",true),f.scope));
        assertThrows(IllegalArgumentException.class,()->service.read(7L,f.call("read_shopping","includePrices",true,"userId",99L),f.scope));
        verifyNoInteractions(f.shopping,f.prices);
    }
    @Test void missingEstimateDependencyKeepsLegacyListAndMarksOnlyEstimateUnknown(){
        Fixture f=new Fixture();ReadResult read=f.reads().read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope);assertEquals(1,read.getItems().size());assertNull(read.getPriceEstimate());assertTrue(read.getUnknownFields().contains("priceEstimate"));verifyNoInteractions(f.prices);
    }
}
