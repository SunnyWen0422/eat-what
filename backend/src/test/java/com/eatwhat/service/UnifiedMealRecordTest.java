package com.eatwhat.service;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class UnifiedMealRecordTest {
 final ObjectMapper json=new ObjectMapper();
 RecipeRecord record(long id,String date,String meal,String name){
  RecipeRecord r=new RecipeRecord();r.setId(id);r.setUserId(1L);r.setRecordDateString(date);r.setMealType(meal);r.setRevision(1L);r.setRecordOrigin("manual");r.setRecipeName(name);r.setTargetPeople(2);
  Dish d=new Dish();d.setId(id);d.setName(name);d.setType("veg");r.setDishIds(Collections.singletonList(id));r.setDishDetails(Collections.singletonList(d));return r;
 }
 @Test void savedRecordsCountImmediatelyButFutureRecordsWaitUntilTheirDay(){
  List<RecipeRecord> records=Arrays.asList(record(1,"2026-10-25","lunch","面"),record(2,"2026-10-30","dinner","饭"));
  DietReviewCalculator calc=new DietReviewCalculator(json);
  assertEquals(1,calc.calculate(Collections.emptyList(),records,LocalDate.of(2026,10,25)).get("mealCount"));
  assertEquals(2,calc.calculate(Collections.emptyList(),records,LocalDate.of(2026,10,30)).get("mealCount"));
 }
 @Test void deletionAndEditsRecalculateWithoutAnExtraEatenCopy(){
  RecipeRecord r=record(1,"2026-10-25","lunch","面");DietReviewCalculator calc=new DietReviewCalculator(json);
  MealConsumption old=new MealConsumption();old.setMealDate("2026-10-25");old.setMealType("lunch");old.setStatus("eaten");old.setActualDishesJson("[{\"name\":\"旧菜\"}]");
  assertEquals(1,calc.calculate(Collections.singletonList(old),Collections.singletonList(r),LocalDate.of(2026,10,25)).get("entryCount"));
  r.setIsDeleted(true);assertEquals(0,calc.calculate(Collections.singletonList(old),Collections.singletonList(r),LocalDate.of(2026,10,25)).get("mealCount"));
 }
 @Test void reportUsesBeijingDateAndExcludesFutureDetailsAndTotals(){
  RecipeRecord r=record(1,"2026-10-26","dinner","面");DietReviewCalculator calc=new DietReviewCalculator(json);
  Map<String,Object> before=calc.report(1L,Collections.emptyList(),Collections.singletonList(r),LocalDate.of(2026,10,25),LocalDate.of(2026,10,31),Instant.parse("2026-10-25T15:59:59Z"));
  Map<String,Object> after=calc.report(1L,Collections.emptyList(),Collections.singletonList(r),LocalDate.of(2026,10,25),LocalDate.of(2026,10,31),Instant.parse("2026-10-25T16:00:00Z"));
  assertEquals(0,before.get("mealCount"));assertEquals(1,after.get("mealCount"));
  assertEquals("calendar_records",((Map<?,?>)after.get("metadata")).get("basis"));
 }
 @Test void metadataEditRetainsOwnedHistoricalFreeTextAndSnapshot(){
  com.eatwhat.mapper.RecipeRecordMapper db=org.mockito.Mockito.mock(com.eatwhat.mapper.RecipeRecordMapper.class);
  DishQueryService catalog=org.mockito.Mockito.mock(DishQueryService.class);
  RecipeRecord saved=record(1,"2026-10-25","lunch","面");saved.setDishIds(Collections.emptyList());saved.getDishDetails().get(0).setId(null);saved.setDishDetails(saved.getDishDetails());
  org.mockito.Mockito.when(db.findSlot(1L,"2026-10-25","lunch")).thenReturn(saved);
  RecipeRecord change=new RecipeRecord();change.setUserId(1L);change.setRecordDateString("2026-10-25");change.setMealType("lunch");change.setRecipeName("午餐");change.setDishIds(Collections.emptyList());change.setExpectedRevision(1L);
  new RecipeRecordService(db,catalog).saveRecipeRecord(change);
  assertEquals("面",change.getDishDetails().get(0).getName());org.mockito.Mockito.verifyNoInteractions(catalog);
 }
 @Test void copyingAMigratedFreeTextRecordKeepsItsDishesAndRejectsChangedSource() throws Exception {
  com.eatwhat.mapper.RecipeRecordMapper db=org.mockito.Mockito.mock(com.eatwhat.mapper.RecipeRecordMapper.class);
  com.eatwhat.mapper.MealConsumptionMapper logs=org.mockito.Mockito.mock(com.eatwhat.mapper.MealConsumptionMapper.class);
  DishQueryService catalog=org.mockito.Mockito.mock(DishQueryService.class);
  org.mockito.Mockito.when(logs.lockUser(1L)).thenReturn(1L);
  org.mockito.Mockito.when(logs.request(org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.anyString())).thenReturn(null);
  assertFalse(json.writeValueAsString(new RecipeRecord()).contains("copySource"));
  RecipeRecord source=record(1,"2026-10-25","lunch","外食套餐");source.setDishIds(Collections.emptyList());source.getDishDetails().get(0).setName("面条");source.getDishDetails().get(0).setId(null);source.setDishDetails(source.getDishDetails());
  org.mockito.Mockito.when(db.findSlot(1L,"2026-10-25","lunch")).thenReturn(source);
  RecipeRecord body=json.readValue("{\"requestId\":\"copy-record-1\",\"expectedRevision\":0,\"recipeName\":\"外食套餐\",\"dishIds\":[],\"copySourceDate\":\"2026-10-25\",\"copySourceMealType\":\"lunch\",\"copySourceRevision\":1}",RecipeRecord.class);
  MealPlanService service=new MealPlanService(new RecipeRecordService(db,catalog),db,logs,json);
  service.mutate(1L,"2026-10-26","dinner",body,false);
  org.mockito.ArgumentCaptor<RecipeRecord> saved=org.mockito.ArgumentCaptor.forClass(RecipeRecord.class);org.mockito.Mockito.verify(db).insert(saved.capture());
  assertEquals("面条",saved.getValue().getDishDetails().get(0).getName());assertNull(saved.getValue().getDishDetails().get(0).getId());org.mockito.Mockito.verifyNoInteractions(catalog);
  source.setRevision(2L);body.setRequestId("copy-record-2");assertThrows(MealConsumptionService.VersionConflict.class,()->service.mutate(1L,"2026-10-26","dinner",body,false));
  org.mockito.Mockito.verify(db,org.mockito.Mockito.times(1)).insert(org.mockito.ArgumentMatchers.any());
 }
}
