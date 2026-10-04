package com.eatwhat.service;

import com.eatwhat.controller.ShoppingListController;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.exception.GlobalExceptionHandler;
import com.eatwhat.interceptor.AuthInterceptor;
import com.eatwhat.mapper.*;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class V4ShoppingContractTest {
    private static class Store {
        final ObjectMapper json = new ObjectMapper();
        final ShoppingListMapper lists = mock(ShoppingListMapper.class);
        final ShoppingDishMapper groups = mock(ShoppingDishMapper.class);
        final ShoppingItemMapper items = mock(ShoppingItemMapper.class);
        final ShoppingRequestLogMapper logs = mock(ShoppingRequestLogMapper.class);
        final List<ShoppingItem> rows = new ArrayList<>();
        final Map<String, ShoppingRequestLog> receipts = new HashMap<>();
        final ShoppingList list = new ShoppingList();
        final ShoppingDish group = new ShoppingDish();
        final ShoppingListService service;
        Store(ShoppingPreviewService preview) {
            list.setId(1L); list.setVersion(2L); list.setMetadataVersion(1);
            group.setId(7L); group.setShoppingListId(1L); group.setDishId(9L); group.setDishName("土豆");
            when(lists.findByUserIdForUpdate(3L)).thenReturn(list);
            when(lists.findByUserId(3L)).thenReturn(list);
            when(groups.findByListId(1L)).thenReturn(Collections.singletonList(group));
            when(groups.findBySelectionKey(1L,"meal-one")).thenReturn(group);
            when(items.findByListId(1L,"all")).thenAnswer(i -> new ArrayList<>(rows));
            when(items.insert(any())).thenAnswer(i -> { ShoppingItem row=i.getArgument(0); row.setId((long)rows.size()+1); rows.add(row); return 1; });
            when(items.deleteAll(1L)).thenAnswer(i -> { int size=rows.size(); rows.clear(); return size; });
            when(items.deleteChecked(1L)).thenAnswer(i -> { int size=rows.size(); rows.removeIf(r -> Boolean.TRUE.equals(r.getChecked())); return size-rows.size(); });
            when(lists.updateVersion(eq(1L),eq(3L),anyLong(),anyInt())).thenAnswer(i -> { list.setVersion(i.getArgument(2)); return 1; });
            when(logs.findSuccess(eq(3L),anyString())).thenAnswer(i -> receipts.get(i.getArgument(1)));
            when(logs.insertBoundSuccess(eq(3L),anyString(),anyString(),anyString())).thenAnswer(i -> {
                ShoppingRequestLog receipt=new ShoppingRequestLog(); receipt.setRequestHash(i.getArgument(2)); receipt.setResponseJson(i.getArgument(3)); receipts.put(i.getArgument(1),receipt); return 1;
            });
            service=new ShoppingListService(lists,groups,items,logs,new ShoppingListMergeService(),preview,json);
        }
        void row(boolean checked) { ShoppingItem item=new ShoppingItem(); item.setId((long)rows.size()+1); item.setShoppingDishId(7L); item.setChecked(checked); rows.add(item); }
    }
    private ShoppingClearRequest clear(String key,String scope,Long version) {
        ShoppingClearRequest r=new ShoppingClearRequest(); r.setRequestId(key); r.setScope(scope); r.setExpectedListVersion(version); return r;
    }
    @Test void canonicalAndLegacyClearSupportBothScopesAndBoundReplayInMvc() throws Exception {
        Store store=new Store(mock(ShoppingPreviewService.class)); store.row(true); store.row(false);
        TokenService tokens=mock(TokenService.class); when(tokens.getUserIdFromToken("test-token")).thenReturn(3L);
        MockMvc mvc=MockMvcBuilders.standaloneSetup(new ShoppingListController(mock(ShoppingPreviewService.class),store.service))
            .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new AuthInterceptor(tokens)).build();
        for (String path : Arrays.asList("/shopping-list:clear","/shopping-list/:clear")) {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(store.json.writeValueAsString(clear("unauthorized","all",2L)))).andExpect(status().isUnauthorized());
        }
        String checked=store.json.writeValueAsString(clear("clear-checked","checked",2L));
        mvc.perform(post("/shopping-list:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(checked)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3));
        assertEquals(1,store.rows.size()); assertFalse(store.rows.get(0).getChecked());
        mvc.perform(post("/shopping-list/:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(checked)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3));
        assertEquals(3L,store.list.getVersion());
        mvc.perform(post("/shopping-list:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(store.json.writeValueAsString(clear("clear-checked","all",2L)))).andExpect(status().isConflict());
        mvc.perform(post("/shopping-list/:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(store.json.writeValueAsString(clear("stale","all",2L)))).andExpect(status().isConflict());
        String all=store.json.writeValueAsString(clear("clear-all","all",3L));
        mvc.perform(post("/shopping-list:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(all)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(4));
        assertTrue(store.rows.isEmpty());
        mvc.perform(post("/shopping-list/:clear").header("Authorization","Bearer test-token").contentType(MediaType.APPLICATION_JSON).content(all)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(4));
    }
    @Test void missingOrNegativeVersionsCannotClearBatchPatchOrDelete() {
        for(Long invalid:Arrays.asList(null,-1L)) {
            ShoppingPreviewService previews=preview("2人"); Store store=new Store(previews); store.row(false);
            assertThrows(IllegalArgumentException.class,()->store.service.clear(3L,clear("no-version","all",invalid)));
            ShoppingBatchAddRequest batch=new ShoppingBatchAddRequest(); batch.setRequestId("no-batch-version"); batch.setExpectedListVersion(invalid);
            ShoppingDishRequest selected=new ShoppingDishRequest();selected.setSelectionKey("meal-one");selected.setTargetPeople(new BigDecimal("4"));selected.setItems(preview(previews).getDishes().get(0).getItems());batch.setDishes(Collections.singletonList(selected));
            assertThrows(IllegalArgumentException.class,()->store.service.batchAdd(3L,batch));
            when(store.items.findById(1L,1L)).thenReturn(store.rows.get(0));
            when(store.items.delete(1L,1L)).thenAnswer(i->{store.rows.clear();return 1;});
            ShoppingItemPatchRequest patch=new ShoppingItemPatchRequest(); patch.setChecked(true); patch.setExpectedListVersion(invalid);
            assertThrows(IllegalArgumentException.class,()->store.service.patchItem(3L,1L,patch));
            assertThrows(IllegalArgumentException.class,()->store.service.deleteItem(3L,1L,invalid));
            assertEquals(1,store.rows.size()); assertEquals(2L,store.list.getVersion());
            verify(store.lists,never()).insert(any());
            verify(store.lists,never()).findByUserIdForUpdate(anyLong());
        }
    }
    private ShoppingPreviewService preview(String servings) {
        Dish dish=new Dish(); dish.setId(9L); dish.setName("土豆"); dish.setFl(servings); dish.setIngredientsAmounts("土豆|200|g|主料");
        DishQueryService query=mock(DishQueryService.class); when(query.getDishesByIdsForUser(anyList(),eq(3L))).thenReturn(Collections.singletonList(dish));
        return new ShoppingPreviewService(query,new IngredientParserService(),new IngredientNormalizationService());
    }
    private ShoppingPreviewResponse preview(ShoppingPreviewService service) {
        ShoppingPreviewRequest r=new ShoppingPreviewRequest(); r.setDishIds(Collections.singletonList(9L)); r.setTargetPeople(new BigDecimal("4")); return service.createPreview(3L,r);
    }
    @Test void unknownOrAmbiguousServingsKeepRawTextWithoutNumericProcurement() {
        for(String fl:Arrays.asList(null,"","未知","0人","2-4人","2~4人","15%余量","约两人","people=oops","-2人","0","2人 extra")) {
            ShoppingPreviewResponse response=preview(preview(fl)); ShoppingPreviewItemDTO item=response.getDishes().get(0).getItems().get(0);
            assertEquals("NEEDS_ADJUSTMENT",item.getCalculationStatus(),"fl="+fl);
            assertNull(item.getSourceBasePeople()); assertNull(item.getQuantityValue()); assertNull(item.getQuantityMin()); assertNull(item.getQuantityMax());
            assertEquals("土豆|200|g|主料",item.getQuantityText()); assertFalse(item.getWarnings().isEmpty()); assertFalse(response.getWarnings().isEmpty());
        }
    }
    @Test void recognizedLegacyServingsStillScaleExactly() {
        for(String fl:Arrays.asList("2","2人","2人份","2 人份","2人基础份量","2份","2 servings","serves 2","2.0人")) {
            ShoppingPreviewItemDTO item=preview(preview(fl)).getDishes().get(0).getItems().get(0);
            assertEquals("CALCULATED",item.getCalculationStatus(),fl); assertEquals(0,new BigDecimal("400").compareTo(item.getQuantityValue()));
        }
        ShoppingPreviewItemDTO bulk=preview(preview("100人")).getDishes().get(0).getItems().get(0);
        assertEquals("CALCULATED",bulk.getCalculationStatus());assertEquals(0,new BigDecimal("8").compareTo(bulk.getQuantityValue()));
    }
    @Test void existingRequestKeyConflictsForMissingVersionAndUnboundLegacyReceipt() throws Exception {
        Store store=new Store(mock(ShoppingPreviewService.class)); store.row(false);
        ShoppingClearRequest request=clear("bound-clear","all",2L); store.service.clear(3L,request);
        request.setExpectedListVersion(null);
        assertThrows(MealConsumptionService.VersionConflict.class,()->store.service.clear(3L,request));
        ShoppingRequestLog unbound=new ShoppingRequestLog(); unbound.setResponseJson(store.json.writeValueAsString(store.service.getList(3L,"all"))); store.receipts.put("unbound",unbound);
        assertThrows(MealConsumptionService.VersionConflict.class,()->store.service.clear(3L,clear("unbound","all",3L)));
    }
    @Test void unknownBaseSurvivesTrustedBatchPersistenceAndSummaryReentry() {
        ShoppingPreviewService preview=preview((String)null); Store store=new Store(preview);
        ShoppingDishDTO source=preview(preview).getDishes().get(0);
        ShoppingDishRequest group=new ShoppingDishRequest(); group.setSelectionKey("meal-one"); group.setTargetPeople(new BigDecimal("4")); group.setItems(source.getItems());
        ShoppingBatchAddRequest r=new ShoppingBatchAddRequest(); r.setRequestId("unknown-base"); r.setExpectedListVersion(2L); r.setDishes(Collections.singletonList(group));
        store.service.batchAdd(3L,r);
        ShoppingListResponse saved=store.service.getList(3L,"all"); ShoppingPreviewItemDTO item=saved.getDishes().get(0).getItems().get(0);
        assertEquals("NEEDS_ADJUSTMENT",item.getCalculationStatus()); assertNull(item.getQuantityValue()); assertEquals("土豆|200|g|主料",item.getQuantityText());
        assertTrue(saved.getPurchaseSummary().getMergeableItems().isEmpty()); assertEquals(1,saved.getPurchaseSummary().getSeparateItems().size());
        assertEquals("土豆|200|g|主料",saved.getPurchaseSummary().getSeparateItems().get(0).getQuantityText());
        assertTrue(store.service.batchAdd(3L,r).isIdempotent()); assertEquals(1,store.rows.size());
        r.setTargetPeople(BigDecimal.ONE); assertThrows(MealConsumptionService.VersionConflict.class,()->store.service.batchAdd(3L,r));
    }
    @Test void oldCalculatedRowsWithNoPersistedServingsProofStayUnresolved() {
        Store store=new Store(mock(ShoppingPreviewService.class)); store.row(false); ShoppingItem old=store.rows.get(0);
        old.setCanonicalName("土豆"); old.setDisplayName("土豆"); old.setQuantityValue(new BigDecimal("400")); old.setQuantityText("400g"); old.setSourceQuantityText("土豆|200|g|主料"); old.setUnitFamily("mass"); old.setUnitCode("g"); old.setParseStatus("PARSED"); old.setCalculationStatus("CALCULATED");
        ShoppingListResponse saved=store.service.getList(3L,"all"); ShoppingPreviewItemDTO item=saved.getDishes().get(0).getItems().get(0);
        assertEquals("NEEDS_ADJUSTMENT",item.getCalculationStatus()); assertNull(item.getQuantityValue()); assertEquals("土豆|200|g|主料",item.getQuantityText());
        assertFalse(item.getWarnings().isEmpty()); assertTrue(saved.getPurchaseSummary().getMergeableItems().isEmpty());
    }
    @Test void knownBasePersistsVerifiedCalculationWhileUnresolvedNumericLinesNeverMerge() {
        ShoppingPreviewService preview=preview("2人"); Store store=new Store(preview); ShoppingDishDTO source=preview(preview).getDishes().get(0);
        ShoppingDishRequest group=new ShoppingDishRequest(); group.setSelectionKey("meal-one"); group.setTargetPeople(new BigDecimal("4")); group.setItems(source.getItems());
        ShoppingBatchAddRequest request=new ShoppingBatchAddRequest(); request.setRequestId("known-base"); request.setExpectedListVersion(2L); request.setDishes(Collections.singletonList(group));
        store.service.batchAdd(3L,request); ShoppingListResponse saved=store.service.getList(3L,"all");
        assertEquals("CALCULATED",saved.getDishes().get(0).getItems().get(0).getCalculationStatus()); assertEquals(1,saved.getPurchaseSummary().getMergeableItems().size());
        List<ShoppingPreviewItemDTO> ambiguous=new ArrayList<>();
        for(int i=0;i<2;i++) { ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO(); item.setCanonicalName("土豆"); item.setUnitFamily("mass"); item.setUnitCode("g"); item.setParseStatus("PARSED"); item.setCalculationStatus("NEEDS_ADJUSTMENT"); item.setQuantityValue(new BigDecimal("200")); item.setQuantityText("原始200g"); ambiguous.add(item); }
        assertEquals(2,new ShoppingListMergeService().mergeWithinDish(7L,ambiguous).size());
    }
    @Test void optionalServingsProofPreservesPreUpgradeBoundBatchReceiptHash() throws Exception {
        Store store=new Store(mock(ShoppingPreviewService.class));
        ShoppingBatchAddRequest request=new ShoppingBatchAddRequest();request.setRequestId("legacy-batch");request.setExpectedListVersion(2L);
        ShoppingDishRequest group=new ShoppingDishRequest();group.setSelectionKey("legacy-group");ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();item.setSourceDishId(9L);item.setSourceLineNo(0);group.setItems(Collections.singletonList(item));request.setDishes(Collections.singletonList(group));
        com.fasterxml.jackson.databind.node.ObjectNode oldPayload=store.json.valueToTree(request);
        ((com.fasterxml.jackson.databind.node.ObjectNode)oldPayload.path("dishes").get(0).path("items").get(0)).remove("servingsVerified");
        String oldJson=oldPayload.toString();ShoppingRequestLog receipt=new ShoppingRequestLog();receipt.setRequestHash(WorkflowRequestHash.sha256("ShoppingBatchAddRequest|"+oldJson));receipt.setResponseJson("{\"version\":3,\"dishes\":[]}");store.receipts.put("legacy-batch",receipt);
        ShoppingBatchAddRequest retry=store.json.readValue(oldJson,ShoppingBatchAddRequest.class);
        ShoppingSyncResponse result=assertDoesNotThrow(()->store.service.batchAdd(3L,retry));assertTrue(result.isIdempotent());assertEquals(3L,result.getList().getVersion());assertTrue(store.rows.isEmpty());
    }
    @Test void originalManualOverrideSurvivesReadEvenWhenItsStoredStatusIsUnresolved() {
        Store store=new Store(mock(ShoppingPreviewService.class));store.row(false);ShoppingItem row=store.rows.get(0);
        row.setUserOverride(true);row.setCalculationStatus("NEEDS_ADJUSTMENT");row.setQuantityValue(new BigDecimal("450"));row.setQuantityText("我确认450g");
        ShoppingPreviewItemDTO saved=store.service.getList(3L,"all").getDishes().get(0).getItems().get(0);
        assertEquals(new BigDecimal("450"),saved.getQuantityValue());assertEquals("我确认450g",saved.getQuantityText());assertTrue(saved.isUserOverride());
    }
    @Test void changingOnlyLegacyItemNameCannotConfirmItsPreviouslyInferredNumericAmount() {
        Store store=new Store(mock(ShoppingPreviewService.class));store.row(false);ShoppingItem row=store.rows.get(0);
        row.setCanonicalName("土豆");row.setDisplayName("土豆");row.setQuantityValue(new BigDecimal("400"));row.setQuantityText("400g");row.setSourceQuantityText("土豆|200|g|主料");row.setUnitFamily("mass");row.setUnitCode("g");row.setParseStatus("PARSED");row.setCalculationStatus("CALCULATED");
        when(store.items.findById(1L,1L)).thenReturn(row);
        ShoppingItemPatchRequest patch=new ShoppingItemPatchRequest();patch.setExpectedListVersion(2L);patch.setDisplayName("土豆大块");
        ShoppingPreviewItemDTO renamed=store.service.patchItem(3L,1L,patch).getDishes().get(0).getItems().get(0);
        assertNull(renamed.getQuantityValue());assertEquals("土豆|200|g|主料",renamed.getQuantityText());
        assertEquals("NEEDS_ADJUSTMENT",renamed.getCalculationStatus());assertFalse(renamed.isUserOverride());assertFalse(renamed.getWarnings().isEmpty());
        assertEquals(renamed,store.service.getList(3L,"all").getDishes().get(0).getItems().get(0));
        patch.setExpectedListVersion(3L);patch.setQuantityValue(new BigDecimal("450"));patch.setQuantityText("450g");
        ShoppingPreviewItemDTO confirmed=store.service.patchItem(3L,1L,patch).getDishes().get(0).getItems().get(0);
        assertEquals(new BigDecimal("450"),confirmed.getQuantityValue());assertEquals("450g",confirmed.getQuantityText());assertTrue(confirmed.isUserOverride());
        assertEquals("USER_OVERRIDE",confirmed.getCalculationStatus());assertTrue(confirmed.getWarnings().isEmpty());
    }
    @Test void editingOnlyUnverifiedItemUnitCannotClearItsQuantityWarning() {
        for(String status:Arrays.asList("CALCULATED","NEEDS_ADJUSTMENT")) {
            Store store=new Store(mock(ShoppingPreviewService.class));store.row(false);ShoppingItem row=store.rows.get(0);
            row.setQuantityValue(new BigDecimal("400"));row.setQuantityText("400g");row.setSourceQuantityText("原始200g");row.setUnitFamily("mass");row.setUnitCode("g");row.setParseStatus("PARSED");row.setCalculationStatus(status);
            when(store.items.findById(1L,1L)).thenReturn(row);
            ShoppingItemPatchRequest patch=new ShoppingItemPatchRequest();patch.setExpectedListVersion(2L);patch.setUnitCode("kg");
            ShoppingPreviewItemDTO edited=store.service.patchItem(3L,1L,patch).getDishes().get(0).getItems().get(0);
            assertNull(edited.getQuantityValue());assertEquals("原始200g",edited.getQuantityText());assertEquals("kg",edited.getUnitCode());
            assertEquals("NEEDS_ADJUSTMENT",edited.getCalculationStatus());assertFalse(edited.isUserOverride());assertFalse(edited.getWarnings().isEmpty());
            assertEquals(edited,store.service.getList(3L,"all").getDishes().get(0).getItems().get(0));
            patch.setExpectedListVersion(3L);patch.setQuantityText("我确认半袋");
            ShoppingPreviewItemDTO confirmed=store.service.patchItem(3L,1L,patch).getDishes().get(0).getItems().get(0);
            assertEquals("我确认半袋",confirmed.getQuantityText());assertNull(confirmed.getQuantityValue());assertTrue(confirmed.isUserOverride());
            assertEquals("USER_OVERRIDE",confirmed.getCalculationStatus());assertTrue(confirmed.getWarnings().isEmpty());
        }
    }
    @Test void labelingVerifiedOrManualQuantityPreservesItsAmount() {
        for(String status:Arrays.asList("CALCULATED_VERIFIED","USER_OVERRIDE")) {
            Store store=new Store(mock(ShoppingPreviewService.class));store.row(false);ShoppingItem row=store.rows.get(0);
            row.setQuantityValue(new BigDecimal("450"));row.setQuantityText("450g");row.setCalculationStatus(status);row.setUserOverride("USER_OVERRIDE".equals(status));
            when(store.items.findById(1L,1L)).thenReturn(row);
            ShoppingItemPatchRequest patch=new ShoppingItemPatchRequest();patch.setExpectedListVersion(2L);patch.setDisplayName("我的食材");
            ShoppingPreviewItemDTO edited=store.service.patchItem(3L,1L,patch).getDishes().get(0).getItems().get(0);
            assertEquals(new BigDecimal("450"),edited.getQuantityValue());assertEquals("450g",edited.getQuantityText());assertEquals("我的食材",edited.getDisplayName());assertTrue(edited.getWarnings().isEmpty());
        }
    }
}
