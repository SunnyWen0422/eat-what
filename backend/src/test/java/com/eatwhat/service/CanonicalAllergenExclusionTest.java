package com.eatwhat.service;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CanonicalAllergenExclusionTest {
 @Test void explicitAllergenExclusionDoesNotTreatUnknownAsAbsent() throws Exception {
  ObjectMapper json=new ObjectMapper();Dish unknown=new Dish();unknown.setId(3L);unknown.setRecipe(json.readTree("{\"allergenCodes\":null}"));
  Dish safe=new Dish();safe.setId(2L);safe.setRecipe(json.readTree("{\"allergenCodes\":[]}"));
  Dish contains=new Dish();contains.setId(1L);contains.setTagCodes("ALLERGEN_PEANUT");contains.setRecipe(json.readTree("{\"allergenCodes\":[\"ALLERGEN_PEANUT\"]}"));
  DishMapper mapper=mock(DishMapper.class,call->"selectRecommendationCandidateFacts".equals(call.getMethod().getName())?Arrays.asList(unknown,safe,contains):Collections.emptyList());
  RecommendationCriteria filter=new RecommendationCriteria();filter.setExcludeTagCodes(Arrays.asList("ALLERGEN_PEANUT"));
  List<Dish> selected=new DishCandidateQueryService(mapper).findRawForUser(9L,null,null,filter,10);
  assertEquals(1,selected.size());assertEquals(2L,selected.get(0).getId());
 }
}
