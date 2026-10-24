package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishQualityMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DishQualityIsolationTest {
 @Test void retiredMalformedProfilesCannotPolluteValidCanonicalRecipes(){DishQualityMapper db=mock(DishQualityMapper.class);DishQualityService wrapper=new DishQualityService(db,CanonicalTestCatalog.JSON);wrapper.setCatalog(CanonicalTestCatalog.service());Dish a=CanonicalTestCatalog.fish(1),b=CanonicalTestCatalog.fish(2);assertDoesNotThrow(()->wrapper.enrich(Arrays.asList(a,b)));assertNull(a.getQuality());assertNull(b.getQuality());verifyNoInteractions(db);}
 @Test void missingCanonicalRecipeNeverFallsBackToLegacyText(){DishQualityService wrapper=CanonicalTestCatalog.quality(CanonicalTestCatalog.service());Dish legacy=new Dish();legacy.setId(1L);legacy.setCl("鱼|100|g");assertThrows(IllegalStateException.class,()->wrapper.enrich(legacy));}
 @Test void canonicalStorageFailureRemainsDiagnosable(){CanonicalCatalogService catalog=mock(CanonicalCatalogService.class);Dish d=CanonicalTestCatalog.fish(1);when(catalog.enrich(d)).thenThrow(new IllegalStateException("storage unavailable"));DishQualityService wrapper=CanonicalTestCatalog.quality(catalog);assertThrows(IllegalStateException.class,()->wrapper.enrich(d));}
 @Test void onlyCanonicalContentChangesVersion(){Dish d=CanonicalTestCatalog.fish(1);String before=d.getContentVersion();d.setCl("旧值修改");assertEquals(before,d.getContentVersion());CanonicalTestCatalog.changed(d,r->r.put("name","改名"));assertNotEquals(before,d.getContentVersion());}
}
