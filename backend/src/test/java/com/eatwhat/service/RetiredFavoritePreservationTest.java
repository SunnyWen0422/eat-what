package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.entity.FavoriteDish;
import com.eatwhat.mapper.FavoriteDishMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RetiredFavoritePreservationTest {
 @Test void historicalFavoriteRemainsVisibleWithoutEnteringCurrentRecipeCalculator() {
  FavoriteDishMapper mapper=mock(FavoriteDishMapper.class);
  CanonicalCatalogService catalog=mock(CanonicalCatalogService.class);
  FavoriteDish saved=new FavoriteDish();saved.setId(7L);saved.setDishId(693L);saved.setUserId(11L);
  Dish retired=new Dish();retired.setId(693L);retired.setName("历史菜品");saved.setDish(retired);
  when(mapper.selectFavoritesByUser(11L)).thenReturn(Collections.singletonList(saved));
  FavoriteDishService service=new FavoriteDishService();
  ReflectionTestUtils.setField(service,"favoriteDishMapper",mapper);ReflectionTestUtils.setField(service,"catalog",catalog);
  List<FavoriteDish> result=service.getFavorites(11L);
  assertEquals(1,result.size());assertEquals(693L,result.get(0).getDish().getId());
  assertTrue(new ObjectMapper().valueToTree(result.get(0)).path("unavailable").asBoolean());
  verify(catalog).enrich(Collections.<Dish>emptyList());
  assertNull(result.get(0).getDish().getRecipe());
 }
 @Test void lookupKeepsRetiredRowsButCandidateScopeStaysCurrent() throws Exception {
  String sql=String.join(" ",FavoriteDishMapper.class.getMethod("selectFavoritesByUser",Long.class).getAnnotation(Select.class).value());
  assertTrue(sql.contains("catalog_retired_source"));assertTrue(sql.contains("JOIN catalog_recipe"));
  assertFalse(sql.contains("JOIN food"),"Favorite lookup must not materialize the full compatibility view");
  String check=String.join(" ",FavoriteDishMapper.class.getMethod("isFavorite",Long.class,Long.class).getAnnotation(Select.class).value());
  assertTrue(check.contains("catalog_retired_source"));
  String candidates=String.join(" ",FavoriteDishMapper.class.getMethod("selectDishIdsByUser",Long.class).getAnnotation(Select.class).value());
  assertFalse(candidates.contains("catalog_retired_source"));
 }
}
