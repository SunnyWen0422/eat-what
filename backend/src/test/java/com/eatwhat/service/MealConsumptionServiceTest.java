package com.eatwhat.service;
import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MealConsumptionServiceTest {
 @Test void retiredWritesCannotCreateASecondMealState(){
  MealConsumptionMapper old=mock(MealConsumptionMapper.class);RecipeRecordMapper records=mock(RecipeRecordMapper.class);
  MealConsumptionService service=new MealConsumptionService(old,records,mock(DishQueryService.class),new ObjectMapper(),new DietReviewCalculator(new ObjectMapper()));
  for(String status:Arrays.asList("eaten","skipped","unrecorded")){MealConsumptionRequest request=new MealConsumptionRequest();request.setStatus(status);assertThrows(IllegalArgumentException.class,()->service.save(1L,"2026-10-25","dinner",request));}
  verifyNoInteractions(old,records);
 }
 @Test void overviewUsesOnlyOwnedCalendarRecordsAndRetainsTombstoneRevisions(){
  MealConsumptionMapper old=mock(MealConsumptionMapper.class);RecipeRecordMapper records=mock(RecipeRecordMapper.class);ObjectMapper json=new ObjectMapper();
  RecipeRecord r=new RecipeRecord();r.setId(1L);r.setUserId(7L);r.setRecordDateString("2026-10-25");r.setMealType("dinner");r.setRecipeName("面");r.setRevision(5L);
  when(records.selectRangeDays(7L,"2026-10-25","2026-10-25")).thenReturn(Arrays.asList(r));when(records.slotRevisions(7L,"2026-10-25","2026-10-25")).thenReturn(Arrays.asList(r));
  Map<String,Object> out=new MealConsumptionService(old,records,mock(DishQueryService.class),json,new DietReviewCalculator(json)).overview(7L,"2026-10-25","2026-10-25");
  assertEquals("calendar-records-v1",out.get("recordPolicy"));assertEquals(5L,((Map<?,?>)out.get("planRevisions")).get("2026-10-25|dinner"));assertEquals("recorded",((MealConsumption)((List<?>)out.get("consumptions")).get(0)).getStatus());verifyNoInteractions(old);
 }
}
