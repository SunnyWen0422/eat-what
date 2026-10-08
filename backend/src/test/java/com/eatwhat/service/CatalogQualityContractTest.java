package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.dto.CatalogQuality;
import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogQualityContractTest {
    private final ObjectMapper json=new ObjectMapper();
    private Dish raw(){Dish d=new Dish();d.setId(1L);d.setName("快手青椒肉丝");d.setFl("2名成年人总量+15%冗余");d.setKcal(0);return d;}
    private String profile(String status,String quantity,String base){return "{\"dishId\":1,\"datasetVersion\":\"v1\",\"sourceHash\":\"source\",\"contentHash\":\"content\",\"reviewStatus\":\""+status+"\",\"servingsStatus\":\""+(base==null?"UNKNOWN":"VERIFIED")+"\",\"basePeople\":"+(base==null?"null":"\""+base+"\"")+",\"nutritionStatus\":\"UNKNOWN\",\"nutritionKcal\":null,\"ingredients\":[{\"name\":\"白糖\",\"unit\":\"克\",\"quantityStatus\":\""+(quantity==null?"UNKNOWN":"VERIFIED")+"\",\"identityStatus\":\"VERIFIED\",\"quantityValue\":"+(quantity==null?"null":"\""+quantity+"\"")+",\"rawQuantity\":\"55\",\"rawText\":\"白糖|55|克\",\"preparation\":\"调味\",\"role\":\"调味料\"}]}";}
    private Dish enriched(String status,String qty,String base)throws Exception{
        DishQualityMapper mapper=mock(DishQualityMapper.class);DishQualityMapper.Row row=new DishQualityMapper.Row();row.setDishId(1L);row.setProfileJson(profile(status,qty,base));
        com.fasterxml.jackson.databind.node.ObjectNode node=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(row.getProfileJson());node.put("sourceRecipeVersion",com.eatwhat.util.DishContentVersion.rawOf(raw()));row.setProfileJson(json.writeValueAsString(node));
        when(mapper.find(anyList())).thenReturn(Collections.singletonList(row));return new DishQualityService(mapper,json).enrich(raw());
    }
    @Test void unknownNutritionAndGeneratedQuantityStayUnknown()throws Exception{
        Dish d=enriched("UNREVIEWED",null,null);assertNull(d.getQuality().getNutritionKcal());assertEquals("2名成年人总量+15%冗余",d.getFl());
        assertEquals("55",d.getQuality().getIngredients().get(0).getRawQuantity());assertEquals("UNKNOWN",d.getQuality().getIngredients().get(0).getQuantityStatus());
    }
    @Test void unverifiedIngredientNeverBecomesCalculatedEvenWithAPlainPeopleLabel()throws Exception{
        Dish d=enriched("UNREVIEWED",null,"2");DishQueryService query=mock(DishQueryService.class);
        when(query.getDishesByIdsForUser(anyList(),eq(1L))).thenReturn(Collections.singletonList(d));
        ShoppingPreviewRequest req=new ShoppingPreviewRequest();req.setDishIds(Collections.singletonList(1L));req.setTargetPeople(new BigDecimal("4"));
        com.eatwhat.dto.ShoppingPreviewItemDTO item=new ShoppingPreviewService(query,new IngredientParserService(),new IngredientNormalizationService()).createPreview(1L,req).getDishes().get(0).getItems().get(0);
        assertNull(item.getQuantityValue());assertEquals("NEEDS_ADJUSTMENT",item.getCalculationStatus());assertFalse(item.getQuantityText().contains("55"));
    }
    @Test void verifiedIdentityAmountServingsAndUnitCanScale()throws Exception{
        Dish d=enriched("VERIFIED","10","2");DishQueryService query=mock(DishQueryService.class);when(query.getDishesByIdsForUser(anyList(),eq(1L))).thenReturn(Collections.singletonList(d));
        ShoppingPreviewRequest req=new ShoppingPreviewRequest();req.setDishIds(Collections.singletonList(1L));req.setTargetPeople(new BigDecimal("4"));
        com.eatwhat.dto.ShoppingPreviewItemDTO item=new ShoppingPreviewService(query,new IngredientParserService(),new IngredientNormalizationService()).createPreview(1L,req).getDishes().get(0).getItems().get(0);
        assertEquals(0,new BigDecimal("20").compareTo(item.getQuantityValue()));assertEquals("CALCULATED",item.getCalculationStatus());
    }
    @Test void batchEnrichmentUsesOneReadAndRejectsCrossDishProfile()throws Exception{
        DishQualityMapper mapper=mock(DishQualityMapper.class);DishQualityMapper.Row row=new DishQualityMapper.Row();row.setDishId(1L);row.setProfileJson(profile("UNREVIEWED",null,null).replace("\"dishId\":1","\"dishId\":2"));
        when(mapper.find(anyList())).thenReturn(Collections.singletonList(row));assertThrows(IllegalStateException.class,()->new DishQualityService(mapper,json).enrich(Arrays.asList(raw(),raw())));verify(mapper,times(1)).find(anyList());
    }
    @Test void verifiedProfileCannotSurviveAChangedRawRecipe()throws Exception{
        DishQualityMapper mapper=mock(DishQualityMapper.class);DishQualityMapper.Row row=new DishQualityMapper.Row();row.setDishId(1L);row.setProfileJson(profile("VERIFIED","10","2"));when(mapper.find(anyList())).thenReturn(Collections.singletonList(row));
        assertThrows(IllegalStateException.class,()->new DishQualityService(mapper,json).enrich(raw()));
    }
}
