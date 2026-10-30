package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ShoppingIngredientPresentationTest {
 private final ObjectMapper json=new ObjectMapper();

 @Test void canonicalPreviewSeparatesReadableVariantFromIdentity() throws Exception {
  DishQueryService dishes=mock(DishQueryService.class);
  when(dishes.getDishesByIdsForUser(anyList(),eq(3L))).thenReturn(Collections.singletonList(CanonicalTestCatalog.dish(9L,"蒸菜","salt",new BigDecimal("5"),null)));
  ShoppingPreviewService service=CanonicalTestCatalog.wire(new ShoppingPreviewService(dishes,null,null),CanonicalTestCatalog.service());
  ShoppingPreviewRequest request=new ShoppingPreviewRequest();request.setDishIds(Collections.singletonList(9L));request.setTargetPeople(new BigDecimal("2"));
  JsonNode result=json.valueToTree(service.createPreview(3L,request));
  JsonNode item=result.path("dishes").get(0).path("items").get(0);
  assertEquals("salt",item.path("normalizedVariant").asText());
  assertEquals("盐",item.path("displayName").asText());
  assertTrue(item.has("variantLabel"));assertEquals("",item.path("variantLabel").asText());
  writeFixture("preview",result);
 }

 @Test void persistedCanonicalIdentityIsHiddenButRealPurchaseSpecificationsSurvive() throws Exception {
  ShoppingListMapper lists=mock(ShoppingListMapper.class);ShoppingDishMapper groups=mock(ShoppingDishMapper.class);ShoppingItemMapper items=mock(ShoppingItemMapper.class);
  ShoppingList list=new ShoppingList();list.setId(1L);list.setVersion(2L);when(lists.findByUserId(3L)).thenReturn(list);
  ShoppingDish group=new ShoppingDish();group.setId(7L);group.setDishId(9L);group.setDishName("蒸菜");when(groups.findByListId(1L)).thenReturn(Collections.singletonList(group));
  List<ShoppingItem> rows=new ArrayList<>();
  String[][] values={{"盐","salt"},{"鸡腿","去骨"}};
  for(int i=0;i<values.length;i++){ShoppingItem row=new ShoppingItem();row.setId((long)i+1);row.setShoppingDishId(7L);row.setCanonicalName(values[i][0]);row.setDisplayName(values[i][0]);row.setNormalizedVariant(values[i][1]);row.setQuantityValue(new BigDecimal("5"));row.setQuantityText("5g");row.setUnitCode("g");row.setUnitFamily("mass");row.setCalculationStatus("CALCULATED_CANONICAL");row.setParseStatus("PARSED");rows.add(row);}
  when(items.findByListId(1L,"all")).thenReturn(rows);
  ShoppingListService service=new ShoppingListService(lists,groups,items,mock(ShoppingRequestLogMapper.class),mock(ShoppingListMergeService.class),mock(ShoppingPreviewService.class),json);
  CanonicalCatalogMapper catalog=mock(CanonicalCatalogMapper.class);
  when(catalog.ingredients(anyCollection())).thenReturn(Collections.singletonList("{\"id\":\"salt\",\"name\":\"盐\"}"));
  ReflectionTestUtils.setField(service,"catalogIngredients",catalog);
  JsonNode result=json.valueToTree(service.getList(3L,"all"));
  JsonNode first=result.path("dishes").get(0).path("items").get(0),second=result.path("dishes").get(0).path("items").get(1);
  assertEquals("salt",first.path("normalizedVariant").asText());assertEquals("",first.path("variantLabel").asText());assertTrue(first.has("variantLabel"));
  assertEquals("去骨",second.path("variantLabel").asText());assertEquals("salt",rows.get(0).getNormalizedVariant());
  verify(items,never()).update(any(),anyLong());
  writeFixture("saved",result);
 }
 private void writeFixture(String name,JsonNode value) throws Exception {
  String destination=System.getenv("EATWHAT_SHOPPING_PRESENTATION_FIXTURE");
  if(destination!=null){Path directory=Paths.get(destination);Files.createDirectories(directory);Files.write(directory.resolve(name+".json"),json.writeValueAsBytes(value));}
 }
}
