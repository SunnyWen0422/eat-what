package com.eatwhat.service;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CandidateScanEquivalenceTest {
    @Test void standaloneScansAndRuleGenerationDeclareARepeatableReadSnapshot()throws Exception{
        for(java.lang.reflect.Method method:Arrays.asList(
            DishCandidateQueryService.class.getMethod("findRawForUser",Long.class,String.class,String.class,RecommendationCriteria.class,int.class),
            DishCandidateQueryService.class.getMethod("findForUser",Long.class,String.class,String.class,RecommendationCriteria.class,int.class),
            MealWorkspacePlanner.class.getMethod("generate",Long.class,com.eatwhat.dto.MealWorkspace.class,String.class,Long.class,List.class),
            AssistantReadToolService.class.getMethod("read",Long.class,com.eatwhat.dto.AssistantV4Contract.ToolRead.class,com.eatwhat.dto.AssistantV4Contract.TurnScope.class))){
            org.springframework.transaction.annotation.Transactional tx=method.getAnnotation(org.springframework.transaction.annotation.Transactional.class);
            assertNotNull(tx,method.getName()+" needs one snapshot across batches");assertTrue(tx.readOnly());assertEquals(org.springframework.transaction.annotation.Isolation.REPEATABLE_READ,tx.isolation());
        }
    }
    private Dish row(long id,boolean full){Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType(id%3==0?"soup":"veg");d.setCl(id%11==0?"花生":"青菜");d.setTagCodes(id%7==0?"SPICY":"LIGHT");d.setCookMinutes(10);if(full)d.setSteps("完整的做法正文");return d;}
    @Test void scansAllCandidatesInBoundedFactBatchesWithoutRecipeBodiesAndRetainsExactExclusions(){
        List<Dish> all=new ArrayList<>();for(long id=1025;id>0;id--)all.add(row(id,true));List<Integer>batches=new ArrayList<>();
        DishMapper mapper=mock(DishMapper.class,call->{
            switch(call.getMethod().getName()){
                case "selectFilteredCandidates":return all;
                case "selectRecommendationCandidateFacts":{
                    assertEquals(Long.valueOf(7L),call.<Long>getArgument(0));Long before=call.getArgument(6);int size=call.getArgument(7);assertTrue(size>0&&size<=256);batches.add(size);
                    return all.stream().filter(d->before==null||d.getId()<before).limit(size).map(d->row(d.getId(),false)).collect(Collectors.toList());
                }
                default:return Collections.emptyList();
            }
        });
        RecommendationCriteria c=new RecommendationCriteria();c.setExcludedIngredients(Collections.singletonList("花生"));c.setExcludeTagCodes(Collections.singletonList("SPICY"));
        List<Dish> actual=new DishCandidateQueryService(mapper).findRawForUser(7L,null,null,c,Integer.MAX_VALUE);
        List<Long> expected=all.stream().filter(d->d.getId()%11!=0&&d.getId()%7!=0).map(Dish::getId).collect(Collectors.toList());
        assertEquals(expected,actual.stream().map(Dish::getId).collect(Collectors.toList()));assertEquals(5,batches.size());assertTrue(actual.stream().allMatch(d->d.getSteps()==null));
        verify(mapper,never()).selectFilteredCandidates(anyLong(),any(),any(),anyList(),anyList(),any());
    }
    @Test void publicCandidateReadsFetchCompleteRecipesOnlyForFinalIds(){
        DishMapper mapper=mock(DishMapper.class,call->{
            switch(call.getMethod().getName()){
                case "selectFilteredCandidates":return Arrays.asList(row(9,true),row(8,true));
                case "selectRecommendationCandidateFacts":return Arrays.asList(row(9,false),row(8,false));
                case "selectFilteredPageDetails":{List<Long> ids=call.getArgument(0);assertEquals(Collections.singletonList(9L),ids);return Collections.singletonList(row(9,true));}
                default:return Collections.emptyList();
            }
        });
        List<Dish> selected=new DishCandidateQueryService(mapper).findForUser(7L,null,null,null,1);
        assertEquals("完整的做法正文",selected.get(0).getSteps());verify(mapper,times(1)).selectFilteredPageDetails(Collections.singletonList(9L),7L);
    }
    @Test void projectionRetainsRankingPermissionAndExclusionFactsButExcludesMediaAndSteps(){
        Configuration c=new Configuration();c.addMapper(DishMapper.class);String id=DishMapper.class.getName()+".selectRecommendationCandidateFacts";
        assertTrue(c.hasStatement(id));Map<String,Object> p=new HashMap<>();p.put("userId",7L);p.put("type",null);p.put("keyword",null);p.put("cuisineCodes",Collections.emptyList());p.put("includeTagCodes",Collections.emptyList());p.put("maxCookMinutes",null);p.put("beforeId",null);p.put("limit",256);
        String sql=c.getMappedStatement(id).getBoundSql(p).getSql().toLowerCase(Locale.ROOT);
        assertTrue(sql.contains("force index(primary)"),"Use the keyset ordering index; owner index plus filesort rescans the remaining catalog each batch");
        assertTrue(sql.contains("user_id"));assertTrue(sql.contains("cook_minutes"));assertTrue(sql.contains("cuisine_code"));assertTrue(sql.contains("ingredients_amounts"));assertFalse(sql.contains("step as"));assertFalse(sql.contains("image as"));assertTrue(c.getMappedStatement(id).isFlushCacheRequired());assertFalse(c.getMappedStatement(id).isUseCache());
    }
    @Test void fixedSeedOrderingAndScoresMatchFullRecipesAndChangedOrForeignDetailsFailClosed(){
        com.eatwhat.dto.EffectiveRecommendationCriteria c=new com.eatwhat.dto.EffectiveRecommendationCriteria();
        c.setPreferredTagCodes(Collections.singletonList("LIGHT"));RecommendationScorer scorer=new RecommendationScorer();
        Set<Long> favorite=new HashSet<>(Arrays.asList(2L,9L)),recent=Collections.singleton(9L);
        List<Dish> full=new ArrayList<>(),facts=new ArrayList<>();for(long id=1;id<=1200;id++){full.add(row(id,true));facts.add(row(id,false));}
        Collections.shuffle(full,new Random(773));Collections.shuffle(facts,new Random(773));
        Comparator<Dish> order=Comparator.comparingInt((Dish d)->scorer.score(d,c,favorite,recent)+scorer.ownedIngredientScore(d,Collections.singletonList("青菜"))).reversed();
        full.sort(order);facts.sort(order);assertEquals(full.stream().map(Dish::getId).collect(Collectors.toList()),facts.stream().map(Dish::getId).collect(Collectors.toList()));
        DishMapper mapper=mock(DishMapper.class);DishCandidateQueryService query=new DishCandidateQueryService(mapper);
        Dish changed=row(3,true);changed.setCl("另一种食材");when(mapper.selectFilteredPageDetails(Collections.singletonList(3L),7L)).thenReturn(Collections.singletonList(changed));
        assertThrows(MealConsumptionService.VersionConflict.class,()->query.detailsForFacts(7L,Collections.singletonList(row(3,false))));
        Dish foreign=row(3,true);foreign.setUserId(8L);when(mapper.selectFilteredPageDetails(Collections.singletonList(3L),7L)).thenReturn(Collections.singletonList(foreign));
        assertThrows(MealConsumptionService.VersionConflict.class,()->query.detailsForFacts(7L,Collections.singletonList(row(3,false))));
    }
}
