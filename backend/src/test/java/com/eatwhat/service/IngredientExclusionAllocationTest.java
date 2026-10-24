package com.eatwhat.service;

import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import java.lang.management.ManagementFactory;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IngredientExclusionAllocationTest {
    private DishCandidateQueryService query(String cl, String amounts) {
        Dish dish=new Dish();dish.setId(1L);dish.setCl(cl);dish.setIngredientsAmounts(amounts);CanonicalCandidateFixture.ingredients(dish,cl.split("\\s+"));
        DishMapper mapper=mock(DishMapper.class);
        when(mapper.selectRecommendationCandidateFacts(anyLong(),isNull(),isNull(),anyList(),anyList(),isNull(),isNull(),eq(256)))
            .thenReturn(Collections.singletonList(dish));
        return new DishCandidateQueryService(mapper);
    }
    private boolean excludes(DishCandidateQueryService service,String needle) {
        RecommendationCriteria criteria=new RecommendationCriteria();criteria.setExcludedIngredients(Collections.singletonList(needle));
        return service.findRawForUser(7L,null,null,criteria,1).isEmpty();
    }
    @Test void chineseExclusionDoesNotCopyTheWholeIngredientTextForEveryCandidate() {
        java.lang.management.ThreadMXBean standard=ManagementFactory.getThreadMXBean();
        assumeTrue(standard instanceof com.sun.management.ThreadMXBean);
        com.sun.management.ThreadMXBean bean=(com.sun.management.ThreadMXBean)standard;
        assumeTrue(bean.isThreadAllocatedMemorySupported());
        if(!bean.isThreadAllocatedMemoryEnabled())bean.setThreadAllocatedMemoryEnabled(true);
        char[] chars=new char[65536];Arrays.fill(chars,'菜');
        DishCandidateQueryService service=query("青菜",new String(chars));
        for(int i=0;i<5;i++)assertFalse(excludes(service,"花生"));
        long thread=Thread.currentThread().getId(),before=bean.getThreadAllocatedBytes(thread);
        for(int i=0;i<10;i++)assertFalse(excludes(service,"花生"));
        long allocated=bean.getThreadAllocatedBytes(thread)-before;
        assertTrue(allocated<512*1024,"Chinese exclusions must not allocate a joined copy per row; allocated="+allocated);
    }
    @Test void matchingUsesExactStructuredNamesAndLocaleRootRegardlessOfProse() {
        Locale previous=Locale.getDefault();
        try {
            for(Locale locale:Arrays.asList(Locale.ROOT,Locale.ENGLISH,new Locale("tr","TR"))) {
                Locale.setDefault(locale);
                for(String cl:Arrays.asList("青菜 花生","花","PEANUT I İ ı","","鸡蛋")) {
                    for(String amounts:Arrays.asList("花生油|适量","生","peanut i i\u0307 ı","","盐")) {
                        DishCandidateQueryService service=query(cl,amounts);
                        for(String needle:Arrays.asList("花生","花生油","生","PEANUT","I","İ","ı","i\u0307","蛋 盐"," "," 花生 ")) {
                            boolean expected=!needle.trim().isEmpty()&&Arrays.stream(cl.split("\\s+")).anyMatch(name->name.trim().toLowerCase(Locale.ROOT).equals(needle.trim().toLowerCase(Locale.ROOT)));
                            assertEquals(expected,excludes(service,needle),locale+" / "+needle);
                        }
                    }
                }
            }
        } finally { Locale.setDefault(previous); }
    }
}
