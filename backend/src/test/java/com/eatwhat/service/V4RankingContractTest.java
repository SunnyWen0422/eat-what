package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class V4RankingContractTest {
    @Test void candidateRetrievalDoesNotScoreOrParseIngredientText(){
        class Counted extends Dish{int reads;@Override public String getIngredientsAmounts(){reads++;return "青菜|100|克";}}
        List<Dish> pool=new ArrayList<>();List<Counted> counted=new ArrayList<>();for(long i=1;i<=500;i++){Counted d=new Counted();d.setId(i);d.setName("菜"+i);d.setType("veg");CanonicalTestDish.attach(d,"青菜",5,false);counted.add(d);pool.add(d);}
        try(Fixture f=new Fixture(pool)){MealContext c=context();c.setOwnedIngredients(Collections.singletonList("青菜"));assertEquals(500,f.planner.eligible(3L,c).size());for(Counted d:counted)assertEquals(0,d.reads,"Candidate order must not encode preference scores");}
    }
    @Test void emptyOwnedIngredientsDoNotReadOrParseAnyRecipeText(){
        Dish d=new Dish(){@Override public String getIngredientsAmounts(){throw new AssertionError("Unneeded large ingredient read");}@Override public String getCl(){throw new AssertionError("Unneeded source parse");}};
        assertEquals(0,new RecommendationScorer().ownedIngredientScore(d,Collections.emptyList()));
    }
    private static class Fixture implements AutoCloseable {
        final AnnotationConfigApplicationContext app=new AnnotationConfigApplicationContext();
        final UserPreferenceDTO preference=new UserPreferenceDTO();
        final DishCandidateQueryService candidates=mock(DishCandidateQueryService.class);
        final UserPreferenceService preferences=mock(UserPreferenceService.class);
        final FavoriteDishService favorites=mock(FavoriteDishService.class);
        final MealConsumptionMapper actual=mock(MealConsumptionMapper.class);
        final MealWorkspacePlanner planner;
        Fixture(List<Dish> pool) {
            when(candidates.detailsForFacts(anyLong(),anyList())).thenAnswer(call -> call.getArgument(1)); when(candidates.findRawForUser(eq(3L),isNull(),isNull(),any(),anyInt())).thenAnswer(i->new ArrayList<>(pool)); when(preferences.get(3L)).thenReturn(preference);
            app.registerBean(CanonicalCatalogService.class,CanonicalTestDish::catalog); app.registerBean(DishCandidateQueryService.class,()->candidates); app.registerBean(DishMapper.class,()->mock(DishMapper.class)); app.registerBean(UserPreferenceService.class,()->preferences);
            app.registerBean(FavoriteDishMapper.class,()->mock(FavoriteDishMapper.class));
            app.registerBean(DishQualityService.class,()->CanonicalTestDish.quality());
            app.registerBean(RecommendationMetadataService.class,()->new RecommendationMetadataService(mock(DishMapper.class))); app.registerBean(FavoriteDishService.class,()->favorites); app.registerBean(MealConsumptionMapper.class,()->actual); app.registerBean(ObjectMapper.class,()->new ObjectMapper()); app.registerBean(MealWorkspacePlanner.class); app.refresh(); planner=app.getBean(MealWorkspacePlanner.class);
        }
        public void close() { app.close(); }
    }
    private Dish dish(long id,String cuisine,String ingredients) { Dish d=new Dish(); d.setId(id); d.setName("菜"+id); d.setType("veg"); d.setCuisineCode(cuisine); d.setCl(ingredients); d.setCookMinutes(5); return CanonicalTestDish.attach(d); }
    private MealContext context() { MealContext c=new MealContext(); c.setDate("2026-10-03"); c.setMealType("lunch"); c.setCompositionMode("manual"); c.setCounts(Collections.singletonMap("veg",1)); return MealWorkspaceRules.normalize(c); }
    private MealConsumption record(String day,String status,String snapshot) { MealConsumption m=new MealConsumption(); m.setUserId(3L); m.setMealDate(day); m.setStatus(status); m.setActualDishesJson(snapshot); return m; }
    @Test void actualRecencyIsAppliedDuringSelectionRatherThanCandidateOrdering() {
        try(Fixture f=new Fixture(Arrays.asList(dish(1,"SICHUAN",""),dish(2,null,"")))) {
            f.preference.setPreferredCuisineCodes(Collections.singletonList("SICHUAN")); f.preference.setAvoidRecentDays(3);
            when(f.actual.range(3L,"2026-10-01","2026-10-03")).thenReturn(Collections.singletonList(record("2026-10-02","eaten","[{\"dishId\":\"1\",\"name\":\"历史名字\"}]")));
            MealWorkspace w=new MealWorkspace();w.setContext(context());assertEquals(2L,f.planner.generate(3L,w,"generate",null,null).getDishes().get(0).getId());
            f.preference.setAvoidRecentDays(0); assertEquals(2,f.planner.eligible(3L,context()).size());
        }
    }
    @Test void favoritesAreReadOnlyForAnExplicitFavoriteScope() {
        try(Fixture f=new Fixture(Arrays.asList(dish(1,null,"土豆"),dish(2,null,"")))) {
            when(f.favorites.getFavoriteDishIds(3L)).thenReturn(Collections.singletonList(2L)); MealContext c=context(); c.setOwnedIngredients(Collections.singletonList("土豆"));
            assertEquals(2,f.planner.eligible(3L,c).size());verifyNoInteractions(f.favorites);
            MealWorkspace w=new MealWorkspace(); w.setContext(c); w.getDraft().setDishes(Collections.singletonList(dish(1,null,"土豆"))); w.getDraft().getLockedDishIds().add(1L);
            assertEquals(1L,f.planner.generate(3L,w,"generate",null,null).getDishes().get(0).getId());
            c.setCandidateScope("favorites");assertEquals(2L,f.planner.eligible(3L,c).get(0).getId());assertEquals(1,f.planner.eligible(3L,c).size());
        }
    }
    @Test void onlyCurrentOwnedEatenEntriesWithinWindowContributeAndRecentOnlyPoolRemainsUsable() {
        try(Fixture f=new Fixture(Collections.singletonList(dish(1,"SICHUAN","")))) {
            f.preference.setAvoidRecentDays(3); when(f.actual.range(3L,"2026-10-01","2026-10-03")).thenReturn(Arrays.asList(record("2026-10-02","skipped","[{\"dishId\":\"1\"}]"),record("2026-10-02","unrecorded","[{\"dishId\":\"1\"}]"),record("2026-10-02","eaten","[{\"dishId\":\"1\"}]")));
            MealWorkspace w=new MealWorkspace(); w.setContext(context()); assertEquals(1L,f.planner.generate(3L,w,"generate",null,null).getDishes().get(0).getId());
        }
    }
}
