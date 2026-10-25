package com.eatwhat.service;

import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.mapper.RecipeRecordMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Arrays;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Legacy commands cannot recreate a second meal fact after the one-time merge.
 * Historical correction preservation is tested by test_unified_meal_migration.py. */
class V4ActualHistoryContractTest {
 @Test void retiredCommandsNeverWriteOrReplayAnAlternateMealState() throws Exception {
  MealConsumptionMapper legacy=mock(MealConsumptionMapper.class);RecipeRecordMapper records=mock(RecipeRecordMapper.class);DishQueryService catalog=mock(DishQueryService.class);
  ObjectMapper json=new ObjectMapper();MealConsumptionService service=new MealConsumptionService(legacy,records,catalog,json,new DietReviewCalculator(json));
  for(String status:Arrays.asList("eaten","skipped","unrecorded")){
   MealConsumptionRequest request=json.readValue("{\"requestId\":\"old-retry\",\"expectedRevision\":2,\"status\":\""+status+"\",\"usePlan\":true}",MealConsumptionRequest.class);
   assertThrows(IllegalArgumentException.class,()->service.save(3L,"2026-01-01","dinner",request));
  }
  verifyNoInteractions(legacy,records,catalog);
 }
}
