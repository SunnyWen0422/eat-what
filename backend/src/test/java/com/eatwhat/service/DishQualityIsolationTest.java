package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DishQualityIsolationTest {
    final ObjectMapper json=new ObjectMapper();
    Dish dish(long id){Dish d=new Dish();d.setId(id);d.setName("炒鸡蛋");d.setCl("鸡蛋");d.setIngredientsAmounts("鸡蛋|100|克|主料|切块");d.setFl("2人");d.setStep("鸡蛋炒熟");return d;}
    DishQualityMapper.Row row(long id,String value){DishQualityMapper.Row r=new DishQualityMapper.Row();r.setDishId(id);r.setProfileJson(value);return r;}
    @Test void malformedSingleProfileDoesNotBreakTheOtherRecipeOrRestoreRawAmounts(){
        DishQualityMapper db=mock(DishQualityMapper.class);when(db.find(anyList())).thenReturn(Collections.singletonList(row(1,"{broken")));
        Dish a=dish(1),b=dish(2);DishQualityService service=new DishQualityService(db,json);
        assertDoesNotThrow(()->service.enrich(Arrays.asList(a,b)));
        assertNotNull(a.getQuality());assertEquals("UNKNOWN",a.getQuality().getServingsStatus());assertNull(a.getQuality().getBasePeople());
        assertNull(a.getQuality().getIngredients().get(0).getQuantityValue());
        assertTrue(a.getQuality().getIssueCodes().contains("QUALITY_RECORD_INVALID"));
        assertEquals(false,service.getEffectiveCapabilities(a,a.getQuality()).get("scalable"));
        DishQueryService query=mock(DishQueryService.class);when(query.getDishesByIdsForUser(anyList(),eq(1L))).thenReturn(Collections.singletonList(a));
        ShoppingPreviewRequest req=new ShoppingPreviewRequest();req.setDishIds(Collections.singletonList(1L));req.setTargetPeople(new java.math.BigDecimal("4"));
        ShoppingPreviewItemDTO item=new ShoppingPreviewService(query,new IngredientParserService(),new IngredientNormalizationService()).createPreview(1L,req).getDishes().get(0).getItems().get(0);
        assertNull(item.getQuantityValue());assertEquals("NEEDS_ADJUSTMENT",item.getCalculationStatus());
        assertEquals("炒鸡蛋",b.getName());
    }
    @Test void duplicateProfileAndVersionDriftLoseDerivedEligibility(){
        DishQualityMapper db=mock(DishQualityMapper.class);
        when(db.find(anyList())).thenReturn(Arrays.asList(row(1,"{}"),row(1,"{}")));
        Dish d=new DishQualityService(db,json).enrich(dish(1));
        assertNotNull(d.getQuality());assertNotEquals("VERIFIED",d.getQuality().getReviewStatus());
    }
    @Test void databaseFailureIsStillDiagnosable(){
        DishQualityMapper db=mock(DishQualityMapper.class);when(db.find(anyList())).thenThrow(new IllegalStateException("storage unavailable"));
        assertThrows(IllegalStateException.class,()->new DishQualityService(db,json).enrich(dish(1)));
    }
    @Test void changedCorruptEvidenceStillChangesContentRevision(){
        DishQualityMapper db=mock(DishQualityMapper.class);DishQualityService service=new DishQualityService(db,json);
        when(db.find(anyList())).thenReturn(Collections.singletonList(row(1,"{broken-v1")));
        String first=service.enrich(dish(1)).getContentVersion();
        when(db.find(anyList())).thenReturn(Collections.singletonList(row(1,"{broken-v2")));
        assertNotEquals(first,service.enrich(dish(1)).getContentVersion());
    }
}
