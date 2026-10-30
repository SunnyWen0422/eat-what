package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantNutritionBoundaryTest {
 @Test void serializedRecipeAndActualNutritionPassStrictPythonAndAsgi() throws Exception {
  String python=System.getProperty("recommendation.python");Assumptions.assumeTrue(python!=null);
  AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();Dish dish=CanonicalAssistantFixture.enrich(AssistantReadToolTest.Fixture.dish(999,"青菜"));
  ObjectNode n=((ObjectNode)dish.getRecipe()).putObject("calculatedNutrition");n.put("scope",CanonicalRecipeCalculator.NUTRITION_SCOPE);n.put("completeness","complete");ObjectNode total=n.putObject("total");for(String key:CanonicalRecipeCalculator.NUTRIENTS)total.put(key,100.49);n.putNull("perServing");
  when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Arrays.asList(dish));
  ReadResult read=f.reads().read(7L,f.call("get_dish_details","dish_ids",Arrays.asList(999L)),f.scope);
  MealConsumption actual=new MealConsumption();actual.setStatus("recorded");actual.setMealDate("2026-10-01");actual.setMealType("dinner");
  Map<String,Object> nutrition=DietNutritionSummary.snapshot(dish,f.json);nutrition.put("nutritionVersion",String.join("",Collections.nCopies(64,"a")));
  actual.setActualDishesJson(f.json.writeValueAsString(Arrays.asList(AssistantV4ContextService.map("dishId",999L,"name","青菜","type","veg","nutritionSnapshot",nutrition))));
  StepInput input=new StepInput();ModelContext context=new ModelContext();context.getCapabilities().add("get_dish_details");context.getRecentActual().add(AssistantV4ContextService.actual(actual,f.json));input.setContext(context);input.setMessage("查看今天实际记录的营养");
  Path script=Paths.get("..").toAbsolutePath().normalize().resolve("scripts/check_assistant_nutrition_boundary.py");
  Process process=new ProcessBuilder(python,script.toString()).redirectErrorStream(true).start();
  try(java.io.OutputStream out=process.getOutputStream()){out.write(f.json.writeValueAsBytes(AssistantV4ContextService.map("input",input,"read",read)));}
  if(!process.waitFor(30,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);fail("Isolated nutrition contract timed out; no external network access is allowed");}
  byte[] output=process.getInputStream().readAllBytes();assertEquals(0,process.exitValue(),new String(output,java.nio.charset.StandardCharsets.UTF_8));
 }
}
