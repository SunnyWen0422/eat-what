package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SelectedMealValidationTest {
 static class Fixture {
  DishMapper db=mock(DishMapper.class);UserPreferenceService prefs=mock(UserPreferenceService.class);DishCandidateQueryService candidates=new DishCandidateQueryService(db);MealWorkspacePlanner planner;
  Fixture(){when(prefs.get(7L)).thenReturn(new UserPreferenceDTO());when(db.selectSelectedCandidateFacts(eq(7L),isNull(),isNull(),anyList(),anyList(),any(),anyList())).thenAnswer(call->{List<Long> ids=call.getArgument(6);List<Dish> out=new ArrayList<>();for(Long id:ids)if(id<4)out.add(dish(id));return out;});when(db.selectFilteredPageDetails(anyList(),eq(7L))).thenAnswer(call->{List<Dish> out=new ArrayList<>();for(Long id:(List<Long>)call.getArgument(0))out.add(dish(id));return out;});planner=new MealWorkspacePlanner(candidates,db,prefs,new RecommendationMetadataService(db),mock(FavoriteDishService.class),mock(MealConsumptionMapper.class),new ObjectMapper());}
  Dish dish(long id){Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType(id==1?"meat":"veg");d.setCookMinutes(id==3?null:10);d.setCl(id==2?"花生":"青菜");d.setTagCodes("");return d;}
  MealWorkspace workspace(){MealWorkspace w=new MealWorkspace();MealContext c=new MealContext();c.setMealType("lunch");c.setDate("2026-10-17");w.setContext(MealWorkspaceRules.normalize(c));return w;}
 }
 @Test void manual_selection_does_not_scan_or_rank_catalog_and_keeps_order(){Fixture f=new Fixture();PlanDraft draft=f.planner.generate(7L,f.workspace(),"select",null,Arrays.asList(2L,1L));assertEquals(Arrays.asList(2L,1L),Arrays.asList(draft.getDishes().get(0).getId(),draft.getDishes().get(1).getId()));verify(f.db,never()).selectRecommendationCandidateFacts(any(),any(),any(),any(),any(),any(),any(),anyInt());}
 @Test void missing_and_hard_excluded_dishes_are_rejected(){Fixture f=new Fixture();assertThrows(IllegalArgumentException.class,()->f.planner.generate(7L,f.workspace(),"select",null,Arrays.asList(1L,999L)));MealWorkspace w=f.workspace();w.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));assertThrows(IllegalArgumentException.class,()->f.planner.generate(7L,w,"select",null,Arrays.asList(1L,2L)));}
 @Test void unknown_time_does_not_satisfy_whole_meal_deadline(){Fixture f=new Fixture();MealWorkspace w=f.workspace();w.getContext().setTotalCookMinutes(30);assertThrows(IllegalArgumentException.class,()->f.planner.generate(7L,w,"select",null,Arrays.asList(1L,3L)));}
 @Test void automatic_breakfast_validation_still_requires_approved_tag(){Fixture f=new Fixture();MealWorkspace w=f.workspace();w.getContext().setMealType("breakfast");assertThrows(IllegalArgumentException.class,()->f.planner.validateAgent(7L,w,Arrays.asList(1L,2L)));}
 @Test void pending_locked_dish_still_must_satisfy_hard_criteria(){Fixture f=new Fixture();MealWorkspace w=f.workspace();w.getDraft().getLockedDishIds().add(2L);w.getContext().getCriteria().setExcludedIngredients(Collections.singletonList("花生"));assertThrows(IllegalArgumentException.class,()->f.planner.generate(7L,w,"select",null,Collections.singletonList(1L)));}
}
