package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class HanExcludedPageTest {
 @Test void hanExclusionsUseCanonicalIdentitiesWithBoundedPaging(){
  DishMapper db=mock(DishMapper.class);RecommendationCriteria c=new RecommendationCriteria();c.setExcludedIngredients(Arrays.asList(" 香菜 ","花生"));
  List<Dish> rows=new ArrayList<>();for(long id=60;id>0;id--){Dish d=new Dish();d.setId(id);rows.add(CanonicalCandidateFixture.ingredients(d,id<=9?"香菜":"青菜"));}
  when(db.selectFilteredCandidateFacts(any(),any(),any(),any(),any(),any(),any(),eq(256))).thenReturn(rows);
  when(db.selectFilteredPageDetails(anyList(),eq(1L))).thenAnswer(call->{List<Long> ids=call.getArgument(0);List<Dish> selected=new ArrayList<>();for(Dish d:rows)if(ids.contains(d.getId()))selected.add(d);return selected;});
  DishPageDTO page=new DishCandidateQueryService(db).findRawPageForUser(1L,null,null,c,2,10);assertEquals(51,page.getTotal());assertEquals(50L,page.getList().get(0).getId());assertEquals(10,page.getList().size());
  verify(db,never()).countHanExcludedDishes(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void latin_or_tag_exclusions_keep_existing_java_semantics(){for(boolean tag:new boolean[]{true,false}){DishMapper db=mock(DishMapper.class);RecommendationCriteria c=new RecommendationCriteria();if(tag)c.setExcludeTagCodes(Collections.singletonList("LIGHT"));else c.setExcludedIngredients(Collections.singletonList("PeAnUt"));when(db.selectFilteredCandidateFacts(any(),any(),any(),any(),any(),any(),any(),anyInt())).thenReturn(Collections.emptyList());new DishCandidateQueryService(db).findRawPageForUser(1L,null,null,c,1,10);verify(db,never()).countHanExcludedDishes(any(),any(),any(),any(),any(),any(),any());}}
}
