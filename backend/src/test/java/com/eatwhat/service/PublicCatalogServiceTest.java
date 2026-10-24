package com.eatwhat.service;

import com.eatwhat.config.PublicCatalogProperties;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.eatwhat.util.DishContentVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PublicCatalogServiceTest {
    PublicCatalogProperties properties;
    PublicCatalogMapper mapper;
    DishQualityMapper qualityMapper;
    ObjectMapper json = new ObjectMapper();
    PublicCatalogService service;
    @BeforeEach void setup() {
        properties = new PublicCatalogProperties(); mapper = mock(PublicCatalogMapper.class); qualityMapper = mock(DishQualityMapper.class);
        service = new PublicCatalogService(properties,mapper,qualityMapper,json);
        CanonicalTestCatalog.wire(service,CanonicalTestCatalog.service());
    }
    void enabled() { properties.setEnabled(true); properties.setAllowedDishIds(Arrays.asList(1L,2L)); }
    Dish dish() { Dish d = CanonicalTestCatalog.dish(1,"测试菜","green",new BigDecimal("100"),new BigDecimal("2"));d.setType("veg");d.setIsCustom(0);d.setIsPublished(1);return d; }
    void image(Dish dish,String image){CanonicalTestCatalog.changed(dish,r->r.put("imageUrl",image));dish.setImage(image);}
    void listed(Dish d) { when(mapper.count(anyList(),isNull())).thenReturn(1L); when(mapper.list(anyList(),isNull(),anyInt(),anyInt())).thenReturn(Collections.singletonList(d)); }
    void status(int expected, org.junit.jupiter.api.function.Executable work) { assertEquals(expected,assertThrows(ResponseStatusException.class,work).getStatus().value()); }
    CatalogQuality profile(Dish d) {
        CatalogQuality q = new CatalogQuality(); q.setDishId(d.getId()); q.setSourceRecipeVersion(DishContentVersion.rawOf(d)); q.setReviewStatus("VERIFIED"); q.setBasePeople(new BigDecimal("2")); q.setServingsStatus("VERIFIED"); q.setStepStatus("VERIFIED"); q.setTimeStatus("UNKNOWN");
        CatalogQuality.Ingredient i = new CatalogQuality.Ingredient(); i.setName("青菜"); i.setRawText("青菜100g"); i.setUnit("g"); i.setQuantityValue(new BigDecimal("100")); i.setIdentityStatus("VERIFIED"); i.setQuantityStatus("VERIFIED"); i.setSourceLabel("private evidence"); i.setIdentityEvidence("private identity"); i.setQuantityEvidence("private quantity"); q.setIngredients(Collections.singletonList(i));
        q.setReviewedBy("private reviewer"); q.setSourceRef("private origin"); q.setNutritionKcal(800); q.setIssueCodes(Arrays.asList("private reviewer phone", "UNKNOWN_INTERNAL")); return q;
    }
    void quality(String text) { DishQualityMapper.Row row = new DishQualityMapper.Row(); row.setDishId(1L); row.setProfileJson(text); when(qualityMapper.find(anyList())).thenReturn(Collections.singletonList(row)); }
    @Test void disabledCatalogNeverReadsAnyRowsOrProfiles() {
        status(503,() -> service.list(1,50,null)); status(503,() -> service.detail(1)); verifyNoInteractions(mapper,qualityMapper);
    }
    @Test void enabledEmptyAllowlistReturnsOnlyAnEmptyPageAndUnavailableDetail() {
        properties.setEnabled(true); PublicDishPageDTO page=service.list(1,50,null);
        assertTrue(page.getList().isEmpty()); assertEquals(0,page.getTotal()); status(404,() -> service.detail(1)); verifyNoInteractions(mapper,qualityMapper);
    }
    @Test void guessedUnreleasedIdsCannotReadDishOrQuality() { enabled(); status(404,() -> service.detail(77)); verifyNoInteractions(mapper,qualityMapper); }
    @Test void missingApprovedDishReturns404() { enabled(); status(404,() -> service.detail(1)); }
    @Test void paginationAndTypeAreStrictAndOverflowSafe() {
        enabled(); for(int[] bad : new int[][]{{0,50},{-1,50},{1,0},{1,101},{Integer.MAX_VALUE,100}}) status(400,() -> service.list(bad[0],bad[1],null));
        status(400,() -> service.list(1,50,"all")); status(400,() -> service.detail(0)); status(400,() -> service.detail(9007199254740992L)); verifyNoInteractions(mapper,qualityMapper);
    }
    @Test void sqlPaginationIsPassedAsBoundedOffsetWithoutLoadingTheWholeDirectory() {
        enabled(); when(mapper.count(anyList(),eq("veg"))).thenReturn(2L); when(mapper.list(anyList(),eq("veg"),eq(1),eq(1))).thenReturn(Collections.singletonList(dish()));
        PublicDishPageDTO result=service.list(2,1,"veg"); assertEquals(2,result.getTotal()); assertEquals(2,result.getPage()); assertEquals(1,result.getPageSize()); assertEquals(1,result.getList().size());
    }
    @Test void unsafeOwnershipFlagsCannotLeakListDetailOrCount() {
        enabled(); for(int n=0;n<6;n++) {
            Dish d=dish(); if(n==0)d.setUserId(9L); if(n==1)d.setIsCustom(1); if(n==2)d.setIsCustom(null); if(n==3)d.setIsPublished(0); if(n==4)d.setIsPublished(null); if(n==5)d.setId(77L);
            listed(d); when(mapper.detail(anyList(),eq(1L))).thenReturn(d); status(503,() -> service.list(1,50,null)); status(404,() -> service.detail(1));
        }
        verifyNoInteractions(qualityMapper);
    }
    @Test void countsLargerThanTheApprovedDirectoryAreRejected() { enabled(); when(mapper.count(anyList(),isNull())).thenReturn(3L); status(503,() -> service.list(1,50,null)); }
    @Test void dtoSerializesOnlyTheExactPublicContractAndSanitizedQuality() throws Exception {
        enabled(); Dish d=dish(); d.setImage("private image"); d.setStepImages("private media"); d.setKcal(999); d.setCreateTime(new Date()); listed(d); when(mapper.detail(anyList(),eq(1L))).thenReturn(d); quality(json.writeValueAsString(profile(d)));
        PublicDishDTO value=service.detail(1); String text=json.writeValueAsString(value);
        Set<String> keys = new HashSet<>(); json.readTree(text).fieldNames().forEachRemaining(keys::add);
        assertEquals(new HashSet<>(Arrays.asList("id","name","type","cl","fl","step","steps","tips","ingredientsAmounts","contentVersion","recipe","scaledRecipe","catalogRevision","quantityPolicy","image")),keys);
        for (String excluded : Arrays.asList("private","userId","isCustom","isPublished","createTime","stepImages","sourceHash","contentHash","Evidence","compositionSource","quantifiedSubtotal")) assertFalse(text.contains(excluded),excluded);
        assertFalse(text.contains("UNKNOWN_INTERNAL"));assertNull(value.getQuality());assertEquals(2,value.getRecipe().path("baseServings").asInt());assertEquals(100,value.getScaledRecipe().path("ingredients").get(0).path("quantity").asInt());
        assertEquals(value.getQuality(),service.list(1,50,null).getList().get(0).getQuality()); assertNotNull(value.getContentVersion());
    }
    @Test void missingMalformedMismatchedOrStaleQualityRemainsUnknown() throws Exception {
        enabled(); Dish d=dish(); when(mapper.detail(anyList(),eq(1L))).thenReturn(d);
        assertNull(service.detail(1).getQuality());String version=service.detail(1).getContentVersion();
        CatalogQuality stale=profile(d); stale.setSourceRecipeVersion("old fingerprint"); CatalogQuality wrong=profile(d); wrong.setDishId(2L);
        for(String raw : Arrays.asList("{broken}","{}",json.writeValueAsString(stale),json.writeValueAsString(wrong))) {
            quality(raw);PublicDishDTO value=service.detail(1);assertNull(value.getQuality());assertEquals(version,value.getContentVersion());assertEquals(100,value.getScaledRecipe().path("ingredients").get(0).path("quantity").asInt());verifyNoInteractions(qualityMapper);
        }
    }
    @Test void releasedCoverSurvivesBothListAndDetailWithoutPublishingOtherMedia() throws Exception {
        enabled(); Dish d=dish(); image(d,"https://cp1.douguo.net/upload/food.jpg"); d.setStepImages("private step media");
        listed(d); when(mapper.detail(anyList(),eq(1L))).thenReturn(d);
        for(PublicDishDTO value : Arrays.asList(service.detail(1),service.list(1,50,null).getList().get(0))) {
            com.fasterxml.jackson.databind.JsonNode tree=json.valueToTree(value);
            assertEquals(d.getImage(),tree.path("image").asText()); assertFalse(tree.has("stepImages")); assertFalse(tree.has("userId"));
        }
        image(d," http://images.example.com/food.jpg?size=small ");
        assertEquals("https://images.example.com/food.jpg?size=small",json.valueToTree(service.detail(1)).path("image").asText());
    }
    @Test void missingOrInvalidCoverDoesNotBreakRecipeBrowsing() {
        enabled(); Dish d=dish(); listed(d); when(mapper.detail(anyList(),eq(1L))).thenReturn(d);
        for(String image : Arrays.asList(null,"","private image","javascript:alert(1)","data:image/png,x","https://user:secret@example.com/a","https://127.0.0.1/a","https://[::1]/a","https://localhost/a","https://server.local/a","https://server.local./a","https://images.example.com/"+String.join("",Collections.nCopies(2050,"a")))) {
            image(d,image);
            com.fasterxml.jackson.databind.JsonNode value=json.valueToTree(service.detail(1));
            assertTrue(value.path("image").isNull(),"Invalid cover must serialize as null");assertTrue(value.path("recipe").path("imageUrl").isNull());
            assertEquals("测试菜",value.path("name").asText()); assertEquals(1,service.list(1,50,null).getList().size());
        }
    }
    @Test void unknownStatusesAndUnverifiedNumbersCannotBePromotedToEvidence() throws Exception {
        enabled(); Dish d=dish(); when(mapper.detail(anyList(),eq(1L))).thenReturn(d); CatalogQuality q=profile(d); q.setReviewStatus("secret custom status"); q.setServingsStatus("VERIFIED"); q.getIngredients().get(0).setQuantityStatus("secret quantity"); quality(json.writeValueAsString(q));
        PublicDishDTO value=service.detail(1);assertNull(value.getQuality());assertEquals(2,value.getRecipe().path("baseServings").asInt());assertFalse(json.writeValueAsString(value).contains("secret"));verifyNoInteractions(qualityMapper);
    }
}
