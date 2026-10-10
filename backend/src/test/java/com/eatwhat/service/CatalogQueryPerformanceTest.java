package com.eatwhat.service;

import com.eatwhat.controller.DishController;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogQueryPerformanceTest {
    private Dish dish(long id, String name, String tags, String ingredients) {
        Dish value = new Dish(); value.setId(id); value.setName(name); value.setType("veg");
        value.setTagCodes(tags); value.setCl(ingredients); return value;
    }
    private List<Dish> rows() {
        List<Dish> rows = new ArrayList<>();
        for (long id = 1; id <= 8; id++) rows.add(dish(id, "菜" + id, id == 3 ? "SPICY" : "LIGHT", id == 4 ? "花生" : "青菜"));
        return rows;
    }
    private RecommendationCriteria exclusions() {
        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setExcludeTagCodes(Collections.singletonList("SPICY"));
        criteria.setExcludedIngredients(Collections.singletonList("花生")); return criteria;
    }
    @Test void pageEnrichesOnlyReturnedDishesAfterHardExclusions() {
        DishMapper dishes = mock(DishMapper.class);
        when(dishes.selectFilteredCandidates(anyLong(), any(), any(), anyList(), anyList(), any())).thenReturn(rows());
        DishQualityMapper profiles = mock(DishQualityMapper.class);
        when(profiles.find(anyList())).thenAnswer(call -> {
            List<Long> ids = call.getArgument(0);
            if (!ids.contains(8L)) return Collections.emptyList();
            DishQualityMapper.Row corrupt = new DishQualityMapper.Row(); corrupt.setDishId(8L); corrupt.setProfileJson("invalid off-page profile");
            return Collections.singletonList(corrupt);
        });
        DishQualityService quality = new DishQualityService(profiles, new ObjectMapper());
        DishCandidateQueryService candidates = new DishCandidateQueryService(dishes); candidates.setQuality(quality);
        DishQueryService query = new DishQueryService(dishes, candidates); query.setQuality(quality);
        DishPageDTO page = assertDoesNotThrow(() -> query.getFilteredDishes(7L, "veg", null, exclusions(), 1, 3));
        assertEquals(6, page.getTotal());
        assertEquals(Arrays.asList(1L, 2L, 5L), page.getList().stream().map(Dish::getId).collect(Collectors.toList()));
        verify(profiles).find(Arrays.asList(1L, 2L, 5L)); verifyNoMoreInteractions(profiles);
    }
    @Test void boundedRecommendationCandidatesEnrichOnlyFinalEligibleRows() {
        DishMapper dishes = mock(DishMapper.class);
        when(dishes.selectFilteredCandidates(anyLong(), any(), any(), anyList(), anyList(), any())).thenReturn(rows());
        DishQualityMapper profiles = mock(DishQualityMapper.class); when(profiles.find(anyList())).thenReturn(Collections.emptyList());
        DishCandidateQueryService candidates = new DishCandidateQueryService(dishes);
        candidates.setQuality(new DishQualityService(profiles, new ObjectMapper()));
        assertEquals(2, candidates.findForUser(7L, null, null, exclusions(), 2).size());
        verify(profiles).find(Arrays.asList(1L, 2L)); verifyNoMoreInteractions(profiles);
    }
    private DishMapper simulatedLiteDatabase() {
        return mock(DishMapper.class, call -> {
            if (!call.getMethod().getName().contains("Lite")) return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
            Object[] args = call.getArguments();
            String type = args.length > 0 ? (String) args[0] : null;
            String keyword = args.length == 3 ? (String) args[1] : null;
            int limit = args.length == 3 ? (Integer) args[2] : args.length == 2 ? (Integer) args[1] : Integer.MAX_VALUE;
            List<Dish> rows = new ArrayList<>();
            for (long id = 1; id <= 1500 && rows.size() < limit; id++) {
                Dish row = dish(id, id == 1 ? "番茄" : "青菜", "LIGHT", "青菜");
                if ((type == null || type.equals(row.getType())) && (keyword == null || row.getName().contains(keyword))) rows.add(row);
            }
            return rows;
        });
    }
    @Test void allTypeLiteHonorsKeywordAndLimitBeforeRowsLeaveTheDatabase() {
        DishQueryService query = new DishQueryService(simulatedLiteDatabase());
        assertEquals(5, query.getDishesLite(null, null, 5).size());
        List<Dish> filtered = query.getDishesLite(null, "  番茄  ", 5);
        assertEquals(1, filtered.size()); assertEquals("番茄", filtered.get(0).getName());
    }
    @Test void typedLiteAlsoHonorsKeywordAndHasAFiniteLimit() {
        DishQueryService query = new DishQueryService(simulatedLiteDatabase());
        assertEquals(1, query.getDishesLite("veg", "番茄", 5).size());
        assertEquals(1000, query.getDishesLite("veg", null, Integer.MAX_VALUE).size());
        assertEquals(1, query.getDishesLite(null, null, -1).size());
    }
    @Test void omittedHttpLiteLimitHasAFiniteDefault() throws Exception {
        java.lang.reflect.Method method = Arrays.stream(DishController.class.getMethods()).filter(m -> m.getName().equals("getDishesLite")).findFirst().get();
        RequestParam limit = method.getParameters()[2].getAnnotation(RequestParam.class);
        assertEquals("500", limit.defaultValue());
    }
    @Test void liteMapperBindsTypeKeywordAndLimitWithoutPuttingInputInSql() throws Exception {
        org.apache.ibatis.session.Configuration config = new org.apache.ibatis.session.Configuration(); config.addMapper(DishMapper.class);
        java.lang.reflect.Method method = DishMapper.class.getMethod("selectDishesLite", String.class, String.class, int.class);
        String keyword = "番茄' OR 1=1 --";
        Object params = new org.apache.ibatis.reflection.ParamNameResolver(config, method).getNamedParams(new Object[]{"veg", keyword, 5});
        org.apache.ibatis.mapping.MappedStatement statement = config.getMappedStatement(DishMapper.class.getName() + ".selectDishesLite");
        org.apache.ibatis.mapping.BoundSql sql = statement.getBoundSql(params);
        assertTrue(sql.getSql().contains("user_id IS NULL")); assertTrue(sql.getSql().contains("COALESCE(IS_PUBLISHED, 1) = 1"));
        assertTrue(sql.getSql().contains("LIMIT ?")); assertFalse(sql.getSql().contains(keyword));
        java.sql.PreparedStatement prepared = mock(java.sql.PreparedStatement.class);
        new org.apache.ibatis.scripting.defaults.DefaultParameterHandler(statement, params, sql).setParameters(prepared);
        verify(prepared).setString(1, "veg"); verify(prepared).setString(2, keyword); verify(prepared).setInt(3, 5);
        Object noType = new org.apache.ibatis.reflection.ParamNameResolver(config, method).getNamedParams(new Object[]{null, keyword, 5});
        org.apache.ibatis.mapping.BoundSql noTypeSql = statement.getBoundSql(noType);
        assertFalse(noTypeSql.getSql().contains("TYPE = ?")); assertTrue(noTypeSql.getSql().contains("NAME LIKE")); assertTrue(noTypeSql.getSql().contains("LIMIT ?"));
    }
}
