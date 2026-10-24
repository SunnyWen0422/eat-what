package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CatalogQualityContractTest {
 final CanonicalCatalogService catalog=CanonicalTestCatalog.service();
 @Test void discretionaryQuantityAndNutritionRemainNull(){Dish d=CanonicalTestCatalog.dish(1,"糖水","sugar",null,new BigDecimal("2"));catalog.enrich(d);assertNull(d.getQuality());assertNull(d.getKcal());assertTrue(d.getScaledRecipe().path("nutrition").path("total").isNull());assertTrue(d.getScaledRecipe().path("ingredients").get(0).path("quantity").isNull());}
 @Test void displayNumbersCannotOverrideDiscretionaryCanonicalFacts(){Dish d=CanonicalTestCatalog.dish(1,"糖水","sugar",null,new BigDecimal("2"));d.setIngredientsAmounts("白糖|55|克");assertTrue(catalog.scale(d,new BigDecimal("4")).path("ingredients").get(0).path("quantity").isNull());}
 @Test void exactIngredientAmountIsIndependentOfDiners(){Dish d=CanonicalTestCatalog.dish(1,"糖水","sugar",new BigDecimal("10"),new BigDecimal("2"));assertEquals(10,catalog.scale(d,new BigDecimal("4")).path("ingredients").get(0).path("quantity").asInt());}
 @Test void oldQualityProfilesAreNotASecondReadSource(){DishQualityMapper rows=mock(DishQualityMapper.class);DishQualityService wrapper=new DishQualityService(rows,CanonicalTestCatalog.JSON);wrapper.setCatalog(catalog);Dish a=CanonicalTestCatalog.fish(1),b=CanonicalTestCatalog.fish(2);wrapper.enrich(Arrays.asList(a,b));assertNull(a.getQuality());assertNull(b.getQuality());verifyNoInteractions(rows);}
 @Test void changingTheCanonicalRecipeChangesVersionAndRecalculates(){Dish d=CanonicalTestCatalog.fish(1);String old=d.getContentVersion();CanonicalTestCatalog.changed(d,r->((ObjectNode)r.path("ingredients").get(0)).put("quantity",200));assertNotEquals(old,d.getContentVersion());assertEquals(200,catalog.scale(d,new BigDecimal("2")).path("ingredients").get(0).path("quantity").asInt());}
}
