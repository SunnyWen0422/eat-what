package com.eatwhat.service;

import com.eatwhat.mapper.DishMapper;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.reflection.ParamNameResolver;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.sql.PreparedStatement;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MainCatalogMapperSqlTest {
    private final Configuration config = new Configuration();
    MainCatalogMapperSqlTest() { config.addMapper(DishMapper.class); }

    private Object parameters(String name, Object... values) {
        Method method = Arrays.stream(DishMapper.class.getMethods()).filter(m -> m.getName().equals(name)).findFirst().get();
        return new ParamNameResolver(config, method).getNamedParams(values);
    }
    private MappedStatement statement(String name) { return config.getMappedStatement(DishMapper.class.getName() + "." + name); }
    private String sql(String name, Object... values) {
        return statement(name).getBoundSql(parameters(name, values)).getSql().replaceAll("\\s+", " ").trim();
    }

    @Test void countPageAndFactsRetainPublishedSystemOrOwnPrivateScopeAndEveryPositiveFilter() throws Exception {
        Object[] filters = {7L, "veg", "x' OR 1=1 --", Arrays.asList("CN", "US"), Arrays.asList("LIGHT", "STEAM"), 30};
        String original = sql("selectFilteredCandidates", filters);
        String expectedWhere = "FROM food WHERE ((user_id IS NULL AND COALESCE(IS_PUBLISHED, 1) = 1) OR user_id = ?) " +
                "AND TYPE = ? AND NAME LIKE CONCAT('%', ?, '%') AND CUISINE_CODE IN ( ? , ? ) " +
                "AND ( FIND_IN_SET(?, TAG_CODES) > 0 OR FIND_IN_SET(?, TAG_CODES) > 0 ) " +
                "AND COOK_MINUTES IS NOT NULL AND COOK_MINUTES <= ?";
        String originalWhere = original.substring(original.indexOf("FROM food"), original.indexOf(" ORDER BY"));
        // Ignore only formatting introduced by MyBatis foreach; all predicates remain explicit here.
        assertEquals(expectedWhere.replaceAll("\\s+", ""), originalWhere.replaceAll("\\s+", ""));
        assertEquals("SELECT COUNT(*) " + originalWhere, sql("countFilteredDishes", filters));
        Object[] factFilters = Arrays.copyOf(filters, 8); factFilters[6] = 900L; factFilters[7] = 256;
        String facts = sql("selectFilteredCandidateFacts", factFilters);
        String keysetWhere=originalWhere.replace("FROM food ","FROM food ");
        assertEquals(keysetWhere + " AND ID < ? ORDER BY ID DESC LIMIT ?", facts.substring(facts.indexOf("FROM food")));
        assertEquals("SELECT ID as id, RECIPE_JSON as recipeJson, CL as cl, INGREDIENTS_AMOUNTS as ingredientsAmounts, TAG_CODES as tagCodes ",
                facts.substring(0, facts.indexOf("FROM food")));
        Object[] pageFilters = Arrays.copyOf(filters, 8); pageFilters[6] = 5; pageFilters[7] = 10L;
        assertEquals(original.replace("FROM food ","FROM food ") + " LIMIT ? OFFSET ?", sql("selectFilteredDishesPage", pageFilters));
        MappedStatement mapped = statement("selectFilteredDishesPage"); Object params = parameters("selectFilteredDishesPage", pageFilters);
        BoundSql bound = mapped.getBoundSql(params);
        assertFalse(bound.getSql().contains((String) filters[2]));
        PreparedStatement prepared = mock(PreparedStatement.class);
        new DefaultParameterHandler(mapped, params, bound).setParameters(prepared);
        verify(prepared).setLong(1, 7L); verify(prepared).setString(2, "veg");
        verify(prepared).setString(3, "x' OR 1=1 --"); verify(prepared).setString(4, "CN");
        verify(prepared).setString(5, "US"); verify(prepared).setString(6, "LIGHT");
        verify(prepared).setString(7, "STEAM"); verify(prepared).setInt(8, 30);
        verify(prepared).setInt(9, 5); verify(prepared).setLong(10, 10L);
    }

    @Test void unfilteredCatalogAndFullPageReloadKeepVisibilityOrderingAndDerivedCustomFlag() {
        Object[] filters = {7L, null, null, Collections.emptyList(), Collections.emptyList(), null};
        String count = sql("countFilteredDishes", filters);
        assertEquals("SELECT COUNT(*) FROM food WHERE ((user_id IS NULL AND COALESCE(IS_PUBLISHED, 1) = 1) OR user_id = ?)", count);
        String reloaded = sql("selectCatalogDishesByIds", Arrays.asList(9L, 4L), 7L);
        assertTrue(reloaded.contains("CASE WHEN user_id IS NULL THEN 0 ELSE 1 END as isCustom"));
        assertTrue(reloaded.contains("STEPS as steps, STEP_IMAGES as stepImages"));
        assertEquals("FROM food WHERE ID IN ( ? , ? ) AND ((user_id IS NULL AND COALESCE(IS_PUBLISHED, 1) = 1) OR user_id = ?) ORDER BY ID DESC",
                reloaded.substring(reloaded.indexOf("FROM food")));
    }
}
