package com.eatwhat.service;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class DietReviewCalculatorTest {
 RecipeRecord record(String date,String details){RecipeRecord r=new RecipeRecord();r.setUserId(1L);r.setRecordDateString(date);r.setMealType("dinner");r.setRevision(1L);r.setDishDetailsString(details);return r;}
 @Test void savedMenusCountWithoutExtraConfirmationAndUnknownNamesStayVisible(){
  List<RecipeRecord> records=Arrays.asList(record("2026-10-01","[{\"id\":1,\"name\":\"青菜\",\"type\":\"veg\"}]"),record("2026-10-02","[{\"id\":1,\"name\":\"青菜\",\"type\":\"veg\"},{\"name\":\"外食\"}]"));
  Map<String,Object> report=new DietReviewCalculator(new ObjectMapper()).calculate(Collections.emptyList(),records,LocalDate.of(2026,10,5));
  assertEquals(2,report.get("mealCount"));assertEquals(2,report.get("recordedDays"));assertEquals(1,report.get("uniqueDishCount"));assertEquals(3,report.get("entryCount"));assertEquals(1,report.get("unclassifiedCount"));assertFalse(report.containsKey("plannedMealsDue"));
 }
 @Test void latestSlotRevisionWinsAndDeletionRemovesIt(){RecipeRecord old=record("2026-10-01","[]"),latest=record("2026-10-01","[]");latest.setRevision(2L);latest.setIsDeleted(true);assertEquals(0,new DietReviewCalculator(new ObjectMapper()).calculate(Collections.emptyList(),Arrays.asList(latest,old),LocalDate.of(2026,10,5)).get("mealCount"));}
}
