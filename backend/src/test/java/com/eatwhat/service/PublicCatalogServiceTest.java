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
    }
    void enabled() { properties.setEnabled(true); properties.setAllowedDishIds(Arrays.asList(1L,2L)); }
    Dish dish() { Dish d = new Dish(); d.setId(1L); d.setName("测试菜"); d.setType("veg"); d.setCl("青菜"); d.setStep("煮熟"); d.setIsCustom(0); d.setIsPublished(1); return d; }
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
        assertEquals(new HashSet<>(Arrays.asList("id","name","type","cl","fl","step","steps","tips","ingredientsAmounts","contentVersion","quality")),keys);
        for (String excluded : Arrays.asList("private","userId","isCustom","isPublished","createTime","nutrition","image","sourceHash","contentHash","Evidence")) assertFalse(text.contains(excluded),excluded);
        assertFalse(text.contains("UNKNOWN_INTERNAL")); assertEquals("VERIFIED",value.getQuality().getReviewStatus()); assertEquals(new BigDecimal("2"),value.getQuality().getBasePeople()); assertEquals("VERIFIED",value.getQuality().getIngredients().get(0).getIdentityStatus());
        assertEquals(value.getQuality(),service.list(1,50,null).getList().get(0).getQuality()); assertNotNull(value.getContentVersion());
    }
    @Test void missingMalformedMismatchedOrStaleQualityRemainsUnknown() throws Exception {
        enabled(); Dish d=dish(); when(mapper.detail(anyList(),eq(1L))).thenReturn(d);
        assertEquals("UNKNOWN",service.detail(1).getQuality().getReviewStatus());
        CatalogQuality stale=profile(d); stale.setSourceRecipeVersion("old fingerprint"); CatalogQuality wrong=profile(d); wrong.setDishId(2L);
        for(String raw : Arrays.asList("{broken}","{}",json.writeValueAsString(stale),json.writeValueAsString(wrong))) {
            quality(raw); PublicDishDTO value=service.detail(1); assertEquals("UNKNOWN",value.getQuality().getReviewStatus()); assertNull(value.getQuality().getBasePeople()); assertTrue(value.getQuality().getIngredients().isEmpty()); assertEquals("UNKNOWN",value.getQuality().getStepStatus());
        }
    }
    @Test void unknownStatusesAndUnverifiedNumbersCannotBePromotedToEvidence() throws Exception {
        enabled(); Dish d=dish(); when(mapper.detail(anyList(),eq(1L))).thenReturn(d); CatalogQuality q=profile(d); q.setReviewStatus("secret custom status"); q.setServingsStatus("VERIFIED"); q.getIngredients().get(0).setQuantityStatus("secret quantity"); quality(json.writeValueAsString(q));
        PublicDishDTO value=service.detail(1); assertEquals("UNKNOWN",value.getQuality().getReviewStatus()); assertNull(value.getQuality().getBasePeople()); assertEquals("UNKNOWN",value.getQuality().getIngredients().get(0).getQuantityStatus()); assertNull(value.getQuality().getIngredients().get(0).getQuantityValue()); assertFalse(json.writeValueAsString(value).contains("secret"));
    }
}
