package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class BalancedRecommendationPolicyTest {
    private final RecommendationMetadataService metadata=new RecommendationMetadataService(org.mockito.Mockito.mock(com.eatwhat.mapper.DishMapper.class));
    private final BalancedRecommendationPolicy policy=new BalancedRecommendationPolicy(metadata);
    private MealContext context(){MealContext c=new MealContext();c.setDate("2026-10-21");c.setMealType("dinner");c.setCompositionMode("manual");c.setCounts(new LinkedHashMap<>(Collections.singletonMap("veg",1)));c.setRecommendationPolicy(BalancedRecommendationPolicy.VERSION);return c;}
    private Dish dish(long id,String tags){Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType("veg");d.setTagCodes(tags);d.setCookMinutes(10);return d;}
    @Test void aHundredChoicesCompleteOneCycleBeforeRepeatingAndSerializationPreservesIt() throws Exception {
        MealWorkspace w=new MealWorkspace();w.setContext(context());List<Dish> pool=new ArrayList<>();for(int i=1;i<=100;i++)pool.add(dish(i,""));Set<Long> seen=new HashSet<>();
        for(int i=0;i<100;i++){
            BalancedRecommendationPolicy.Selection s=policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(i));
            assertTrue(seen.add(s.dishes.get(0).getId()));w.setRecommendationCycle(s.cycle);w.getDraft().setDishes(s.dishes);
            w=new com.fasterxml.jackson.databind.ObjectMapper().readValue(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(w),MealWorkspace.class);
        }
        assertEquals(100,seen.size());assertEquals(1,policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(0)).dishes.size());
    }
    @Test void currentWishGetsOneNewDishThenOtherNewDishesBeforeRepeating(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));
        List<Dish> pool=Arrays.asList(dish(1,"LIGHT"),dish(2,""),dish(3,""));
        BalancedRecommendationPolicy.Selection first=policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(5));
        assertEquals(1L,first.dishes.get(0).getId());w.setRecommendationCycle(first.cycle);w.getDraft().setDishes(first.dishes);
        BalancedRecommendationPolicy.Selection second=policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(5));
        assertNotEquals(1L,second.dishes.get(0).getId());assertTrue(second.explanations.contains("偏好菜本轮已推荐，先为你换些新菜"));
    }
    @Test void duplicateNamesAreOneChoiceAndFailedSelectionDoesNotChangeCycle(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());Dish a=dish(1,""),b=dish(2,"");b.setName(a.getName());w.getContext().getCounts().put("veg",2);
        assertThrows(IllegalArgumentException.class,()->policy.select(Arrays.asList(a,b),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(0)));
        assertTrue(w.getRecommendationCycle().isEmpty());
    }
    @Test void preferenceWeightCapsByGroupAndLearningCannotOverrideExplicitDimensions(){
        MealContext c=context();c.getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT","SWEET_SOUR"));Dish d=dish(1,"LIGHT,SWEET_SOUR");UserPreferenceDTO saved=new UserPreferenceDTO();saved.setPreferredTagCodes(Arrays.asList("LIGHT"));
        assertEquals(160,policy.weight(d,c,saved,Collections.emptyList(),Collections.singletonMap("flavor:LIGHT",1.2)),0.001);
        c.getRecommendationPreferences().setIncludeTagCodes(Collections.emptyList());
        assertEquals(130,policy.weight(d,c,saved,Collections.emptyList(),Collections.singletonMap("flavor:LIGHT",0.8)),0.001);
    }
    @Test void weightedRandomStillExploresEveryEligibleCandidate(){
        MealContext c=context();UserPreferenceDTO saved=new UserPreferenceDTO();saved.setPreferredTagCodes(Arrays.asList("LIGHT"));int matches=0;Set<Long> seen=new HashSet<>();List<Dish> pool=new ArrayList<>();for(int i=1;i<=20;i++)pool.add(dish(i,i<=10?"LIGHT":""));Random random=new Random(17);
        for(int i=0;i<6000;i++){MealWorkspace w=new MealWorkspace();w.setContext(c);Dish chosen=policy.select(pool,w,saved,Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,random).dishes.get(0);seen.add(chosen.getId());if(chosen.getId()<=10)matches++;}
        assertEquals(20,seen.size());assertTrue(matches>3100&&matches<3600,"weighted share="+matches);
        System.out.println("balanced-v1 simulation: 6000 draws, preferred="+matches+", coverage="+seen.size()+"/20, seed=17");
    }
    @Test void structuredMainIngredientsCountButCondimentsAndAmbiguousTextDoNot(){
        MealContext c=context();c.setOwnedIngredients(Arrays.asList("土豆","盐","油"));Dish d=dish(1,"");
        d.setIngredientsAmounts("旧的展示文字不参与权重");CanonicalCandidateFixture.ingredients(d,"土豆");
        assertEquals(115,policy.weight(d,c,new UserPreferenceDTO(),Collections.emptyList(),Collections.emptyMap()),.001);
        d.setRecipe(null);d.setIngredientsAmounts("土豆、盐、油适量");assertEquals(100,policy.weight(d,c,new UserPreferenceDTO(),Collections.emptyList(),Collections.emptyMap()),.001);
    }
    @Test void timeContributionHasOneCapAndUnknownTimeStaysNeutral(){
        MealContext c=context();c.getRecommendationPreferences().setMaxCookMinutes(20);c.setExpectedTotalCookMinutes(30);Dish d=dish(1,"");
        assertEquals(120,policy.weight(d,c,new UserPreferenceDTO(),Collections.emptyList(),Collections.emptyMap()),.001);
        d.setCookMinutes(null);assertEquals(100,policy.weight(d,c,new UserPreferenceDTO(),Collections.emptyList(),Collections.emptyMap()),.001);
    }
    @Test void replacementKeepsOriginalPositionAndUnchangedSnapshots(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getCounts().put("veg",2);Dish a=dish(1,""),b=dish(2,""),d=dish(3,"");w.getDraft().setDishes(Arrays.asList(a,b));
        BalancedRecommendationPolicy.Selection result=policy.select(Arrays.asList(a,b,d),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"replace",1L,new Random(1));
        assertEquals(3L,result.dishes.get(0).getId());assertSame(b,result.dishes.get(1));
    }
    @Test void hardWholeMealTimeKeepsRoomForRemainingDishes(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getCounts().put("veg",3);w.getContext().setTotalCookMinutes(30);
        Dish slow=dish(1,"LIGHT");slow.setCookMinutes(25);w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));
        BalancedRecommendationPolicy.Selection result=policy.select(Arrays.asList(slow,dish(2,""),dish(3,""),dish(4,"")),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(1));
        assertEquals(30,MealWorkspaceRules.totalMinutes(result.dishes));assertFalse(result.explanations.contains("偏好菜本轮已推荐，先为你换些新菜"));
    }
    @Test void currentWishWinsOverSoftRecentAndCalendarAvoidance(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));
        BalancedRecommendationPolicy.Selection s=policy.select(Arrays.asList(dish(1,"LIGHT"),dish(2,"")),w,new UserPreferenceDTO(),Collections.singleton(1L),Collections.singleton(1L),Collections.emptyMap(),"generate",null,new Random(9));
        assertEquals(1L,s.dishes.get(0).getId());assertTrue(s.explanations.contains("按本餐想吃搭配，包含近期吃过的菜"));
    }
    @Test void acceptedCodeSpellingsAndAllRequiredDimensionsWork(){
        MealContext c=context();c.getRecommendationPreferences().setIncludeTagCodes(Arrays.asList(" light "));c.getRecommendationPreferences().setCuisineCodes(Arrays.asList(" cantonese "));
        Dish d=dish(1,"LIGHT");d.setCuisineCode("CANTONESE");assertEquals(220,policy.weight(d,c,new UserPreferenceDTO(),Collections.emptyList(),Collections.emptyMap()),.001);
        c.getCriteria().setCuisineCodes(Arrays.asList("CANTONESE"));c.getCriteria().setIncludeTagCodes(Arrays.asList("LIGHT","STEAM"));
        assertFalse(policy.matchesRequiredGroups(d,c));d.setTagCodes("LIGHT,STEAM");assertTrue(policy.matchesRequiredGroups(d,c));
    }
    @Test void nameUniquenessIsIncludedInWholeMealFeasibility(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());Map<String,Integer> counts=new LinkedHashMap<>();counts.put("meat",1);counts.put("veg",1);counts.put("soup",1);w.getContext().setCounts(counts);w.getContext().setTotalCookMinutes(12);
        Dish a=dish(1,"LIGHT"),b=dish(2,""),x=dish(3,""),v=dish(4,""),y=dish(5,""),s=dish(6,"");
        a.setType("meat");b.setType("meat");b.setCookMinutes(1);x.setName("同名菜");x.setCookMinutes(1);y.setName("同名菜");y.setType("soup");y.setCookMinutes(1);s.setType("soup");
        w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));
        for(int seed=0;seed<20;seed++){BalancedRecommendationPolicy.Selection selection=policy.select(Arrays.asList(a,b,x,v,y,s),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(seed));assertEquals(12,MealWorkspaceRules.totalMinutes(selection.dishes));assertEquals(2L,selection.dishes.get(0).getId());}
    }
    @Test void eachCategoryHasItsOwnCompleteCycle(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getCounts().put("soup",1);List<Dish> pool=new ArrayList<>();for(int i=1;i<=12;i++){Dish d=dish(i,"");if(i>6)d.setType("soup");pool.add(d);}Set<Long> seen=new HashSet<>();
        for(int round=0;round<6;round++){BalancedRecommendationPolicy.Selection s=policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(round));for(Dish d:s.dishes)assertTrue(seen.add(d.getId()));w.setRecommendationCycle(s.cycle);w.getDraft().setDishes(s.dishes);}assertEquals(12,seen.size());
    }
    @Test void largeCatalogWithHardTimeRemainsBounded(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getCounts().put("veg",3);w.getContext().setTotalCookMinutes(30);List<Dish> pool=new ArrayList<>();for(int i=1;i<=50000;i++)pool.add(dish(i,"LIGHT"));
        assertTimeout(java.time.Duration.ofSeconds(12),()->assertEquals(3,policy.select(pool,w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(2)).dishes.size()));
    }
    @Test void slowPickCannotForcePrematureRolloverInAnotherCategory(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());Map<String,Integer> counts=new LinkedHashMap<>();counts.put("meat",1);counts.put("veg",1);w.getContext().setCounts(counts);w.getContext().setTotalCookMinutes(20);
        Dish slow=dish(1,"LIGHT"),fast=dish(2,""),fresh=dish(3,""),used=dish(4,"");slow.setType("meat");slow.setCookMinutes(15);fast.setType("meat");fast.setCookMinutes(5);used.setCookMinutes(5);w.getRecommendationCycle().put("veg",new HashSet<>(Collections.singletonList(BalancedRecommendationPolicy.identity(used))));w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));
        BalancedRecommendationPolicy.Selection s=policy.select(Arrays.asList(slow,fast,fresh,used),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(1));
        assertEquals(Arrays.asList(2L,3L),s.dishes.stream().map(Dish::getId).collect(java.util.stream.Collectors.toList()));
    }
    @Test void aMultiDishMenuUsesRemainingFreshNamesBeforeStartingNextCycle(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getCounts().put("veg",3);w.getRecommendationCycle().put("veg",new HashSet<>(Arrays.asList("菜1","菜2","菜3")));
        BalancedRecommendationPolicy.Selection s=policy.select(Arrays.asList(dish(1,""),dish(2,""),dish(3,""),dish(4,"")),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(3));
        assertEquals(4L,s.dishes.get(0).getId());assertEquals(3,s.dishes.stream().map(BalancedRecommendationPolicy::identity).distinct().count());
    }
    @Test void aFreshNameInAnotherCategoryCanExhaustThatCategoryBeforeRollover(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());Map<String,Integer> counts=new LinkedHashMap<>();counts.put("meat",1);counts.put("veg",1);w.getContext().setCounts(counts);
        Dish a=dish(1,""),b=dish(2,""),oldMeat=dish(3,""),oldVeg=dish(4,"");a.setType("meat");a.setName("同名菜");b.setName("同名菜");oldMeat.setType("meat");w.getRecommendationCycle().put("meat",new HashSet<>(Arrays.asList("菜3")));w.getRecommendationCycle().put("veg",new HashSet<>(Arrays.asList("菜4")));
        BalancedRecommendationPolicy.Selection s=policy.select(Arrays.asList(a,b,oldMeat,oldVeg),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(4));assertEquals(2,s.dishes.size());assertEquals(2,s.dishes.stream().map(BalancedRecommendationPolicy::identity).distinct().count());assertTrue(s.dishes.stream().anyMatch(d->d.getName().equals("同名菜")));
    }
    @Test void feasibleWishedVersionSurvivesNameDeduplication(){
        MealWorkspace w=new MealWorkspace();w.setContext(context());w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));Dish plain=dish(1,""),wished=dish(2,"LIGHT");plain.setCookMinutes(5);wished.setName(plain.getName());
        for(Integer limit:Arrays.asList(null,30)){
            w.getContext().setTotalCookMinutes(limit);assertEquals(2L,policy.select(Arrays.asList(plain,wished,dish(3,"")),w,new UserPreferenceDTO(),Collections.emptySet(),Collections.emptySet(),Collections.emptyMap(),"generate",null,new Random(5)).dishes.get(0).getId());
        }
    }
    @Test void explicitRequirementsIntersectWithinDimensionsAndAccumulateAcrossDimensions(){
        assertEquals(Arrays.asList("LIGHT","STEAM"),policy.mergeRequiredTags(Arrays.asList("LIGHT"),Arrays.asList("STEAM")));
        assertThrows(IllegalArgumentException.class,()->policy.mergeRequiredTags(Arrays.asList("LIGHT"),Arrays.asList("SWEET_SOUR")));
        assertTrue(policy.preservesRequiredTags(Arrays.asList("LIGHT"),Arrays.asList("LIGHT","STEAM")));
        assertFalse(policy.preservesRequiredTags(Arrays.asList("LIGHT","STEAM"),Arrays.asList("LIGHT")));
    }
}
