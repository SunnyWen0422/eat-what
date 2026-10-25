package com.eatwhat.service;
import com.eatwhat.mapper.*;import com.eatwhat.entity.*;import com.fasterxml.jackson.databind.ObjectMapper;import org.apache.ibatis.session.Configuration;import org.mybatis.spring.*;import org.junit.jupiter.api.Test;import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.jdbc.datasource.DriverManagerDataSource;import java.time.*;import java.util.*;import java.nio.file.*;import static org.junit.jupiter.api.Assertions.*;import static org.mockito.Mockito.*;
class UnifiedMealRecordMysqlIT {
 @Test void archivedSourceIsNotReadAndOneSavedRecordFeedsAllViews() throws Exception {
  String url=System.getenv("V4_TEST_JDBC");assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_v4_test_[a-z0-9]+\\?.*"));
  DriverManagerDataSource source=new DriverManagerDataSource(url,"root",System.getenv("V4_TEST_PASSWORD"));source.setDriverClassName("com.mysql.cj.jdbc.Driver");JdbcTemplate sql=new JdbcTemplate(source);
  Configuration config=new Configuration();config.setMapUnderscoreToCamelCase(true);config.addMapper(MealConsumptionMapper.class);config.addMapper(RecipeRecordMapper.class);SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(config);SqlSessionTemplate session=new SqlSessionTemplate(factory.getObject());
  MealConsumptionMapper adapter=session.getMapper(MealConsumptionMapper.class);RecipeRecordMapper records=session.getMapper(RecipeRecordMapper.class);ObjectMapper json=new ObjectMapper();
  assertEquals(0,sql.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='meal_consumption'",Integer.class));
  List<MealConsumption> meals=adapter.range(1L,"2026-10-25","2026-10-26");assertEquals(2,meals.size());assertEquals("recorded",meals.get(0).getStatus());assertEquals("修改后的面条",meals.get(0).getActualDishes().get(0).get("name"));assertEquals(1,adapter.range(2L,"2026-10-25","2026-10-26").size());
  List<RecipeRecord> saved=records.selectRangeDays(1L,"2026-10-25","2026-10-26");DietReviewCalculator calculator=new DietReviewCalculator(json);
  assertEquals(1,calculator.calculate(Collections.emptyList(),saved,LocalDate.parse("2026-10-25")).get("mealCount"));assertEquals(2,calculator.calculate(Collections.emptyList(),saved,LocalDate.parse("2026-10-26")).get("mealCount"));
  RecipeRecord editable=records.findSlot(1L,"2026-10-25","dinner");editable.setExpectedRevision(editable.getRevision());editable.setRecipeName("两人午餐");editable.setTargetPeople(3);new RecipeRecordService(records,mock(DishQueryService.class)).saveRecipeRecord(editable);
  assertEquals("修改后的面条",adapter.find(1L,"2026-10-25","dinner").getActualDishes().get(0).get("name"));
  RecipeRecord copy=new RecipeRecord();copy.setUserId(1L);copy.setRecordDateString("2026-10-27");copy.setMealType("lunch");copy.setRecipeName("两人午餐");copy.setExpectedRevision(0L);copy.setCopySourceDate("2026-10-25");copy.setCopySourceMealType("dinner");copy.setCopySourceRevision(records.findSlot(1L,"2026-10-25","dinner").getRevision());
  new RecipeRecordService(records,mock(DishQueryService.class)).saveRecipeRecord(copy);assertEquals("修改后的面条",adapter.find(1L,"2026-10-27","lunch").getActualDishes().get(0).get("name"));
  Files.writeString(Path.of(System.getenv("MEAL_RECORD_CONTRACT_OUTPUT")),json.writeValueAsString(AssistantV4ContextService.actual(adapter.find(1L,"2026-10-25","dinner"),json)));
  records.deleteByDateAndMeal(1L,"2026-10-25","dinner");assertNull(adapter.find(1L,"2026-10-25","dinner"));assertEquals(0,calculator.calculate(Collections.emptyList(),records.selectRangeDays(1L,"2026-10-25","2026-10-26"),LocalDate.parse("2026-10-25")).get("mealCount"));
 }
}
