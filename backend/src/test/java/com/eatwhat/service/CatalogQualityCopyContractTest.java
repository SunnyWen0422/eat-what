package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.eatwhat.util.DishContentVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real copy/read/preview services with only SQL/receipt persistence replaced in memory. */
class CatalogQualityCopyContractTest {
    private final ObjectMapper json = new ObjectMapper();
    private final Map<Long,Dish> food = new HashMap<>();
    private final Map<Long,String> profiles = new HashMap<>();
    private final Map<String,String> revisions = new HashMap<>();
    private final Map<String,Map<String,Object>> receipts = new HashMap<>();
    private final PersonalDishMapper personal = mock(PersonalDishMapper.class);
    private final DishMapper dishes = mock(DishMapper.class);
    private final MealConsumptionMapper logs = mock(MealConsumptionMapper.class);
    private final DishQualityMapper qualityRows = mock(DishQualityMapper.class, call -> {
        if ("find".equals(call.getMethod().getName())) {
            List<DishQualityMapper.Row> rows = new ArrayList<>();
            for (Long id : requestedIds(call.getArgument(0))) if (profiles.containsKey(id)) {
                DishQualityMapper.Row row = new DishQualityMapper.Row();
                row.setDishId(id); row.setProfileJson(profiles.get(id)); rows.add(row);
            }
            return rows;
        }
        if ("save".equals(call.getMethod().getName())) {
            CatalogQuality q = call.getArgument(0); profiles.put(q.getDishId(), call.getArgument(1)); return 1;
        }
        if ("saveRevision".equals(call.getMethod().getName())) {
            CatalogQuality q = call.getArgument(0); revisions.put(q.getContentHash(), call.getArgument(1)); return 1;
        }
        return RETURNS_DEFAULTS.answer(call);
    });
    private final DishQualityService quality = new DishQualityService(qualityRows,json);
    private final CustomDishService service = new CustomDishService(dishes,null,personal,logs,json);
    private final DishQueryService query = new DishQueryService(dishes);

    private void fixture(String status) throws Exception {
        service.setQuality(quality); query.setQuality(quality);
        Dish source = new Dish(); source.setId(1L); source.setName("快手糖水"); source.setType("dessert");
        source.setCl("快手#白糖"); source.setIngredientsAmounts("快手|55|克|材料|加工|2人|加工###白糖|55|克|调味料|调味|2人|加工");
        source.setStep("白糖煮水"); source.setSteps("白糖煮水###装碗"); source.setFl("2名成年人总量+15%冗余");
        source.setCookMinutes(10); source.setMetadataVersion(1); food.put(1L,raw(source));
        ObjectNode profile = (ObjectNode)json.readTree("{\"dishId\":1,\"datasetVersion\":\"catalog-v1\",\"sourceHash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"contentHash\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"sourceKind\":\"REVIEWED_SOURCE\",\"sourceRef\":\"https://example.com/source\",\"reviewedBy\":\"source-reviewer\",\"reviewedAt\":\"2026-10-01T00:00:00Z\",\"stepStatus\":\"VERIFIED\",\"servingsStatus\":\"VERIFIED\",\"basePeople\":2,\"nutritionStatus\":\"UNKNOWN\",\"nutritionKcal\":null,\"ingredients\":[{\"name\":\"白糖\",\"unit\":\"克\",\"identityStatus\":\"VERIFIED\",\"identityEvidence\":\"source-ingredient\",\"quantityStatus\":\"VERIFIED\",\"quantityEvidence\":\"source-amount\",\"quantityValue\":10,\"rawQuantity\":\"55\",\"rawText\":\"白糖|55|克|调味料|调味|2人|加工\"}],\"rejectedIngredients\":[{\"line\":0,\"name\":\"快手\",\"rawText\":\"快手|55|克|材料|加工|2人|加工\",\"status\":\"REJECTED\",\"reason\":\"DESCRIPTOR_AS_INGREDIENT\"}]}");
        profile.put("reviewStatus",status); profile.put("sourceRecipeVersion",DishContentVersion.rawOf(source));
        if ("UNREVIEWED".equals(status)) {
            profile.putNull("reviewedBy"); profile.putNull("reviewedAt"); profile.putNull("sourceRef");
            profile.put("sourceKind","LEGACY_GENERATED"); profile.put("servingsStatus","UNKNOWN"); profile.putNull("basePeople");
            ObjectNode ingredient = (ObjectNode)profile.withArray("ingredients").get(0);
            ingredient.put("quantityStatus","UNKNOWN"); ingredient.putNull("quantityValue");
        }
        profiles.put(1L,json.writeValueAsString(profile));
        when(personal.lockReadable(anyLong(),eq(7L))).thenAnswer(call -> read(call.getArgument(0)));
        when(personal.listOwned(7L)).thenAnswer(call -> food.values().stream().filter(d -> Long.valueOf(7).equals(d.getUserId())).map(this::raw).collect(Collectors.toList()));
        when(personal.insert(any())).thenAnswer(call -> { Dish d = call.getArgument(0); d.setId(9L); food.put(9L,raw(d)); return 1; });
        when(personal.update(any())).thenAnswer(call -> { Dish d = call.getArgument(0); food.put(d.getId(),raw(d)); return 1; });
        when(dishes.updateCustomDish(any())).thenAnswer(call -> {
            Dish input = call.getArgument(0), d = read(input.getId());
            if (d == null || !Objects.equals(d.getUserId(),input.getUserId())) return 0;
            d.setName(input.getName()); d.setType(input.getType()); d.setCl(input.getCl()); d.setFl(input.getFl()); d.setStep(input.getStep());
            d.setTags(input.getTags()); d.setCuisineCode(input.getCuisineCode()); d.setTagCodes(input.getTagCodes());
            d.setCookMinutes(input.getCookMinutes()); d.setMetadataVersion(input.getMetadataVersion()); food.put(d.getId(),raw(d)); return 1;
        });
        when(dishes.selectByIdForUser(anyLong(),eq(7L))).thenAnswer(call -> read(call.getArgument(0)));
        when(dishes.selectByIdsForUser(anyList(),eq(7L))).thenAnswer(call -> requestedIds(call.getArgument(0)).stream().map(this::read).filter(Objects::nonNull).collect(Collectors.toList()));
        when(logs.lockUser(7L)).thenReturn(7L);
        when(logs.request(eq(7L),anyString())).thenAnswer(call -> receipts.get(call.getArgument(1)));
        when(logs.log(eq(7L),anyString(),anyString(),anyString())).thenAnswer(call -> {
            Map<String,Object> receipt = new HashMap<>(); receipt.put("requestHash",call.getArgument(2)); receipt.put("responseJson",call.getArgument(3));
            receipts.put(call.getArgument(1),receipt); return 1;
        });
    }
    private List<Long> requestedIds(Object argument) {
        if (!(argument instanceof Collection<?>)) throw new IllegalArgumentException("Expected fixture ID collection");
        List<Long> result = new ArrayList<>();
        for (Object id : (Collection<?>)argument) {
            if (!(id instanceof Long)) throw new IllegalArgumentException("Expected fixture Long ID");
            result.add((Long)id);
        }
        return result;
    }
    private Dish raw(Dish source) { Dish d = json.convertValue(source,Dish.class); d.setQuality(null); return d; }
    private Dish read(Long id) { Dish d = food.get(id); return d == null || (d.getUserId()!=null && !Long.valueOf(7).equals(d.getUserId())) ? null : raw(d); }
    private DishWriteRequest copyRequest() { DishWriteRequest r = new DishWriteRequest(); r.setRequestId("copy-quality"); r.setExpectedVersion(query.getDishById(1L,7L).getContentVersion()); return r; }
    private Dish copy() { return service.copyDish(7L,1L,copyRequest()); }
    private List<ShoppingPreviewItemDTO> preview(Long id) {
        ShoppingPreviewRequest r = new ShoppingPreviewRequest(); r.setDishIds(Collections.singletonList(id)); r.setTargetPeople(new BigDecimal("4"));
        return new ShoppingPreviewService(query,new IngredientParserService(),new IngredientNormalizationService()).createPreview(7L,r).getDishes().get(0).getItems();
    }
    private DishWriteRequest edit(Dish d,String id) {
        DishWriteRequest r = new DishWriteRequest(); r.setRequestId(id); r.setExpectedVersion(d.getContentVersion());
        r.setName(d.getName()); r.setType(d.getType()); r.setCl(d.getIngredientsAmounts()); r.setStep(d.getSteps()); r.setCookMinutes(d.getCookMinutes()); return r;
    }
    @Test void unreviewedCopyReloadAndPreviewKeepRejectedNamesAndGeneratedAmountsOut() throws Exception {
        fixture("UNREVIEWED"); String original = profiles.get(1L); Dish copy = copy();
        assertNotNull(copy.getQuality(),"Copy response must carry its persisted effective facts");
        Dish reloaded = query.getDishById(copy.getId(),7L);
        assertEquals(copy.getContentVersion(),reloaded.getContentVersion()); assertEquals(9L,reloaded.getQuality().getDishId());
        assertEquals("UNREVIEWED",reloaded.getQuality().getReviewStatus()); assertNull(reloaded.getQuality().getReviewedBy());
        List<ShoppingPreviewItemDTO> items = preview(copy.getId()); assertEquals(1,items.size()); assertEquals("白糖",items.get(0).getDisplayName());
        assertEquals("用量待核实",items.get(0).getQuantityText()); assertNull(items.get(0).getQuantityValue());
        assertEquals(original,profiles.get(1L)); assertEquals(copy.getContentVersion(),service.getCustomDishes(7L).get(0).getContentVersion());
        assertEquals("快手",json.readTree(profiles.get(9L)).path("rejectedIngredients").get(0).path("name").asText());
    }
    @Test void verifiedCopyRebindsIdentityPreservesSourceEvidenceAndScalesOnlyCorrectedFacts() throws Exception {
        fixture("VERIFIED"); String original = profiles.get(1L); Dish source = query.getDishById(1L,7L); Dish copy = copy();
        assertNotNull(copy.getQuality()); assertNotSame(source.getQuality(),copy.getQuality());
        assertEquals(9L,copy.getQuality().getDishId()); assertEquals("source-reviewer",copy.getQuality().getReviewedBy());
        assertEquals(source.getQuality().getReviewedAt(),copy.getQuality().getReviewedAt()); assertNull(copy.getQuality().getCookedAt());
        assertEquals(source.getQuality().getSourceRef(),copy.getQuality().getSourceRef());
        assertNotEquals(source.getQuality().getContentHash(),copy.getQuality().getContentHash());
        assertEquals(DishContentVersion.rawOf(copy),copy.getQuality().getSourceRecipeVersion());
        ObjectNode saved = (ObjectNode)json.readTree(profiles.get(9L));
        assertEquals(1L,saved.path("copiedFromDishId").asLong()); assertEquals(source.getContentVersion(),saved.path("copiedFromVersion").asText());
        List<ShoppingPreviewItemDTO> items = preview(9L); assertEquals(1,items.size()); assertEquals(new BigDecimal("20"),items.get(0).getQuantityValue());
        assertEquals("CALCULATED",items.get(0).getCalculationStatus()); assertEquals(original,profiles.get(1L));
        assertTrue(revisions.containsKey(copy.getQuality().getContentHash()));
    }
    @Test void receiptRetryKeepsTheSameGovernedIdentityWithoutAnotherInsert() throws Exception {
        fixture("VERIFIED"); DishWriteRequest request = copyRequest(); Dish first = service.copyDish(7L,1L,request);
        Dish replay = service.copyDish(7L,1L,request); assertNotNull(replay.getQuality());
        assertEquals(first.getQuality(),replay.getQuality()); assertEquals(first.getContentVersion(),replay.getContentVersion());
        verify(personal,times(1)).insert(any()); assertEquals(1,revisions.size());
    }
    @Test void nameAndTimeEditPreservesRecipeFactsAndRebindsTheReloadFingerprint() throws Exception {
        fixture("VERIFIED"); Dish copy = copy(); DishWriteRequest request = edit(copy,"rename-quality"); request.setName("我的糖水"); request.setCookMinutes(15);
        Dish updated = service.updatePersonalDish(7L,9L,request); assertNotNull(updated.getQuality());
        Dish reloaded = query.getDishById(9L,7L); assertEquals(updated.getContentVersion(),reloaded.getContentVersion());
        assertEquals("VERIFIED",reloaded.getQuality().getReviewStatus()); assertEquals("ESTIMATED",reloaded.getQuality().getTimeStatus());
        assertEquals(new BigDecimal("20"),preview(9L).get(0).getQuantityValue());
        assertEquals("source-reviewer",reloaded.getQuality().getReviewedBy()); assertNotEquals(copy.getContentVersion(),updated.getContentVersion());
    }
    @Test void ingredientEditDoesNotKeepOldVerifiedAmountsOrResurrectRejectedDescriptors() throws Exception {
        fixture("VERIFIED"); Dish copy = copy(); DishWriteRequest request = edit(copy,"ingredients-quality");
        request.setCl("快手|55|克|材料|加工|2人|加工###白糖|12|克###柠檬|1|个");
        Dish updated = service.updatePersonalDish(7L,9L,request); assertNotNull(updated.getQuality());
        Dish reloaded = query.getDishById(9L,7L); assertEquals(updated.getContentVersion(),reloaded.getContentVersion());
        assertEquals("UNREVIEWED",reloaded.getQuality().getReviewStatus()); assertNull(reloaded.getQuality().getReviewedBy()); assertNull(reloaded.getQuality().getReviewedAt());
        assertNull(reloaded.getQuality().getBasePeople()); assertEquals("UNKNOWN",reloaded.getQuality().getServingsStatus());
        assertEquals("12",reloaded.getQuality().getIngredients().get(0).getRawQuantity());
        assertEquals("克",reloaded.getQuality().getIngredients().get(0).getUnit());
        List<ShoppingPreviewItemDTO> items = preview(9L); assertEquals(Arrays.asList("白糖","柠檬"),items.stream().map(ShoppingPreviewItemDTO::getDisplayName).collect(Collectors.toList()));
        for (ShoppingPreviewItemDTO item : items) { assertNull(item.getQuantityValue()); assertEquals("用量待核实",item.getQuantityText()); }
        assertEquals(1L,json.readTree(profiles.get(9L)).path("copiedFromDishId").asLong()); assertEquals(2,revisions.size());
    }
    @Test void changedStepsDoNotClaimTheOriginalRecipeWasReviewedOrCooked() throws Exception {
        fixture("VERIFIED"); Dish copy = copy(); DishWriteRequest request = edit(copy,"steps-quality"); request.setStep("冷水拌匀");
        Dish updated = service.updatePersonalDish(7L,9L,request); assertNotNull(updated.getQuality());
        Dish reloaded = query.getDishById(9L,7L); assertEquals("UNREVIEWED",reloaded.getQuality().getReviewStatus());
        assertEquals("UNKNOWN",reloaded.getQuality().getStepStatus()); assertNull(reloaded.getQuality().getReviewedBy());
        assertNull(reloaded.getQuality().getCookedAt()); assertNull(preview(9L).get(0).getQuantityValue());
    }
    @Test void legacyAdminEditReconcilesThePersistedRecipeInsteadOfLeavingAStaleVerifiedProfile() throws Exception {
        fixture("VERIFIED"); Dish copy = copy(); Dish input = raw(copy); input.setCl("柠檬|1|个"); input.setStep("切片");
        Dish updated = service.updateDish(7L,9L,input); assertNotNull(updated.getQuality());
        Dish reloaded = query.getDishById(9L,7L); assertEquals(updated.getContentVersion(),reloaded.getContentVersion());
        assertEquals("UNREVIEWED",reloaded.getQuality().getReviewStatus());
        assertEquals("柠檬",preview(9L).get(0).getDisplayName()); assertNull(preview(9L).get(0).getQuantityValue());
    }
    @Test void staleGovernedVersionCannotOverwriteAnUpdatedCopy() throws Exception {
        fixture("VERIFIED"); Dish copy = copy(); DishWriteRequest rename = edit(copy,"first-rename"); rename.setName("我的糖水");
        service.updatePersonalDish(7L,9L,rename); String saved = profiles.get(9L);
        DishWriteRequest stale = edit(copy,"stale-rename"); stale.setName("过时的修改");
        assertThrows(MealConsumptionService.VersionConflict.class,() -> service.updatePersonalDish(7L,9L,stale));
        assertEquals(saved,profiles.get(9L)); assertEquals("我的糖水",query.getDishById(9L,7L).getName());
    }
}
