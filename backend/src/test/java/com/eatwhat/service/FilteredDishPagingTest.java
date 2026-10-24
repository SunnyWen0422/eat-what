package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Ordinary catalogue reads only; no planner, model, application context or database. */
class FilteredDishPagingTest {
    private Dish row(long id) {
        Dish d = new Dish(); d.setId(id); d.setName("菜" + id);
        d.setCl(id % 5 == 0 ? "花生" : "青菜"); d.setIngredientsAmounts(null);
        d.setTagCodes(id % 7 == 0 ? " light, SpIcY " : "LIGHT"); return CanonicalCandidateFixture.ingredients(d,d.getCl());
    }
    @Test void scansBoundedFactsCountsAllMatchesAndFetchesOnlyRequestedPage() {
        List<Dish> all = new ArrayList<>();
        for (long id = 1200; id > 0; id--) all.add(row(id));
        List<Long> expected = all.stream().filter(d -> d.getId()%5 != 0 && d.getId()%7 != 0).map(Dish::getId).collect(Collectors.toList());
        List<Integer> batchSizes = new ArrayList<>(); List<List<Long>> fetched = new ArrayList<>();
        DishMapper mapper = mock(DishMapper.class, call -> {
            String name = call.getMethod().getName();
            if (name.equals("selectFilteredCandidates")) throw new AssertionError("Main list must not load all full recipes");
            if (name.equals("selectFilteredCandidateFacts")) {
                assertEquals(7L, (Long)call.getArgument(0)); assertEquals("veg", call.getArgument(1));
                assertEquals("菜", call.getArgument(2)); assertEquals(Arrays.asList("CN"), call.getArgument(3));
                assertEquals(Arrays.asList("LIGHT", "STEAM"), call.getArgument(4)); assertEquals(30, (Integer)call.getArgument(5));
                Long before = call.getArgument(6); int limit = call.getArgument(7);
                assertTrue(limit > 0 && limit <= 256); batchSizes.add(limit);
                return all.stream().filter(d -> before == null || d.getId() < before).limit(limit).collect(Collectors.toList());
            }
            if (name.equals("selectFilteredPageDetails")) {
                List<Long> ids = call.getArgument(0); assertEquals(7L, (Long)call.getArgument(1));
                assertTrue(ids.size() <= 100); fetched.add(new ArrayList<>(ids));
                List<Dish> result = ids.stream().map(this::row).collect(Collectors.toList());
                Collections.reverse(result); return result;
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        RecommendationCriteria c = new RecommendationCriteria();
        c.setCuisineCodes(Arrays.asList("CN")); c.setIncludeTagCodes(Arrays.asList("LIGHT", "STEAM")); c.setMaxCookMinutes(30);
        c.setExcludeTagCodes(Arrays.asList(null, "spicy")); c.setExcludedIngredients(Arrays.asList(null, " ", "花生"));
        DishQueryService service = new DishQueryService(mapper);
        DishPageDTO page = service.getFilteredDishes(7L, " veg ", " 菜 ", c, 4, 37);
        assertEquals(expected.size(), page.getTotal());
        assertEquals(expected.subList(111,148), page.getList().stream().map(Dish::getId).collect(Collectors.toList()));
        assertEquals(Collections.singletonList(expected.subList(111,148)), fetched);
        assertTrue(batchSizes.size() >= 5);
        DishPageDTO beyond = service.getFilteredDishes(7L, "veg", "菜", c, Integer.MAX_VALUE, 100);
        assertEquals(expected.size(), beyond.getTotal()); assertTrue(beyond.getList().isEmpty()); assertEquals(1, fetched.size());
    }
    @Test void mapperFactsAreLightweightBoundedAndKeepExistingVisibilityAndFilters() {
        Configuration config = new Configuration(); config.addMapper(DishMapper.class);
        String prefix = DishMapper.class.getName()+".";
        assertTrue(config.hasStatement(prefix+"selectFilteredCandidateFacts"), "A bounded SQL facts query is required");
        assertTrue(config.getMappedStatement(prefix+"selectFilteredCandidateFacts").isFlushCacheRequired(), "Do not retain all batches in the session cache");
        assertFalse(config.getMappedStatement(prefix+"selectFilteredCandidateFacts").isUseCache());
        Map<String,Object> p = new HashMap<>(); p.put("userId",7L); p.put("type","veg"); p.put("keyword","%_' OR 1=1 --");
        p.put("cuisineCodes",Arrays.asList("CN")); p.put("includeTagCodes",Arrays.asList("LIGHT","STEAM"));
        p.put("maxCookMinutes",30); p.put("beforeId",900L); p.put("limit",256);
        String sql = config.getMappedStatement(prefix+"selectFilteredCandidateFacts").getBoundSql(p).getSql().replaceAll("\\s+"," ");
        assertTrue(sql.contains("user_id IS NULL AND COALESCE(IS_PUBLISHED, 1) = 1")); assertTrue(sql.contains("OR user_id = ?"));
        assertTrue(sql.contains("TYPE = ?")); assertTrue(sql.contains("NAME LIKE")); assertTrue(sql.contains("CUISINE_CODE IN"));
        assertTrue(sql.contains("FIND_IN_SET(?, TAG_CODES) > 0 OR FIND_IN_SET(?, TAG_CODES) > 0"));
        assertTrue(sql.contains("COOK_MINUTES <= ?")); assertTrue(sql.contains("ID < ?")); assertTrue(sql.contains("ORDER BY ID DESC LIMIT ?"));
        assertFalse(sql.contains("OR 1=1"));
        String projection = sql.substring(0,sql.indexOf("FROM"));
        for(String field:Arrays.asList("STEP", "IMAGE", "TIPS", "KCAL")) assertFalse(projection.contains(field),field);
        assertTrue(projection.contains("CL as cl")); assertTrue(projection.contains("INGREDIENTS_AMOUNTS")); assertTrue(projection.contains("TAG_CODES"));
        p.put("ids",Arrays.asList(5L,2L));
        String details = config.getMappedStatement(prefix+"selectFilteredPageDetails").getBoundSql(p).getSql();
        assertTrue(details.contains("ID IN")); assertTrue(details.contains("OR user_id = ?"));
        assertTrue(details.contains("STEPS as steps")); assertTrue(details.contains("CASE WHEN user_id IS NULL THEN 0 ELSE 1 END as isCustom"));
    }
    @Test void emptyCatalogAndPageBoundsKeepTheExistingResponseContract() {
        DishMapper mapper = mock(DishMapper.class);
        DishQueryService service = new DishQueryService(mapper);
        DishPageDTO empty = service.getFilteredDishes(7L,null,null,null,-1,Integer.MAX_VALUE);
        assertEquals(1,empty.getPage()); assertEquals(100,empty.getPageSize()); assertEquals(0,empty.getTotal()); assertTrue(empty.getList().isEmpty());
        assertEquals(1,service.getFilteredDishes(7L,null,null,null,1,0).getPageSize());
        verify(mapper,never()).selectFilteredPageDetails(anyList(),any());
    }
}
