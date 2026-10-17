package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class HanExcludedPageTest {
 @Test void han_only_exclusion_uses_exact_sql_count_and_one_page_without_catalog_batches(){DishMapper db=mock(DishMapper.class);RecommendationCriteria c=new RecommendationCriteria();c.setExcludedIngredients(Arrays.asList(" 香菜 ","花生"));Dish d=new Dish();d.setId(7L);when(db.countHanExcludedDishes(eq(1L),isNull(),isNull(),anyList(),anyList(),isNull(),eq(Arrays.asList("香菜","花生")))).thenReturn(51);when(db.selectHanExcludedDishesPage(eq(1L),isNull(),isNull(),anyList(),anyList(),isNull(),eq(Arrays.asList("香菜","花生")),eq(10),eq(10L))).thenReturn(Collections.singletonList(d));DishPageDTO page=new DishCandidateQueryService(db).findRawPageForUser(1L,null,null,c,2,10);assertEquals(51,page.getTotal());assertEquals(7L,page.getList().get(0).getId());verify(db,never()).selectFilteredCandidateFacts(any(),any(),any(),any(),any(),any(),any(),anyInt());}
 @Test void latin_or_tag_exclusions_keep_existing_java_semantics(){for(boolean tag:new boolean[]{true,false}){DishMapper db=mock(DishMapper.class);RecommendationCriteria c=new RecommendationCriteria();if(tag)c.setExcludeTagCodes(Collections.singletonList("LIGHT"));else c.setExcludedIngredients(Collections.singletonList("PeAnUt"));when(db.selectFilteredCandidateFacts(any(),any(),any(),any(),any(),any(),any(),anyInt())).thenReturn(Collections.emptyList());new DishCandidateQueryService(db).findRawPageForUser(1L,null,null,c,1,10);verify(db,never()).countHanExcludedDishes(any(),any(),any(),any(),any(),any(),any());}}
}
