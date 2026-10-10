package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.MealConsumptionMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Pure authorized-catalog selection with fixture data; no model transport or provider is loaded. */
class WorkspaceAgentContextRequestTest {
    private final MealWorkspacePlanner planner = mock(MealWorkspacePlanner.class);
    private final UserPreferenceService preferences = mock(UserPreferenceService.class);
    private final FavoriteDishService favorites = mock(FavoriteDishService.class);
    private final MealConsumptionMapper actual = mock(MealConsumptionMapper.class);
    private final PersonalMenuService menus = mock(PersonalMenuService.class);
    private final RecommendationMetadataService metadata = mock(RecommendationMetadataService.class);
    private final WorkspaceAgentContextService service = new WorkspaceAgentContextService(planner,preferences,favorites,actual,menus,metadata);
    private MealWorkspace workspace(String requirements) {
        MealContext context = new MealContext(); context.setDate("2026-10-09"); context.setRequirements(requirements);
        MealWorkspace workspace = new MealWorkspace(); workspace.setContext(context);
        when(metadata.getOptions()).thenReturn(new RecommendationOptionsDTO()); return workspace;
    }
    private Dish dish(long id,String name,Long owner) {
        Dish d = new Dish(); d.setId(id); d.setName(name); d.setType("veg"); d.setUserId(owner); d.setCl("材料"); return d;
    }
    private List<Dish> pool() {
        List<Dish> pool = new ArrayList<>(); for (long id=1;id<=205;id++) pool.add(dish(id,"普通菜"+id,null)); return pool;
    }
    private List<Long> catalog(MealWorkspace workspace,List<Dish> eligible) {
        when(planner.eligible(eq(7L),any())).thenReturn(eligible);
        when(planner.attachQuality(anyList())).thenAnswer(call -> call.getArgument(0));
        List<Map<String,Object>> rows = (List<Map<String,Object>>)service.build(7L,workspace).get("catalog");
        return rows.stream().map(row -> (Long)row.get("id")).collect(Collectors.toList());
    }
    @Test void namedPublicAndPrivateDishesBeyondTwoHundredAreRetrievedBeforeTheBound() {
        MealWorkspace workspace = workspace("今晚想吃宫保鸡丁和我的妈妈糖水"); List<Dish> eligible = pool();
        eligible.set(203,dish(204,"宫保鸡丁",null)); eligible.set(204,dish(205,"我的妈妈糖水",7L));
        List<Long> ids = catalog(workspace,eligible); assertEquals(200,ids.size()); assertTrue(ids.containsAll(Arrays.asList(204L,205L)));
    }
    @Test void lockedDishStaysIncludedAndEqualMatchesKeepTheExistingRankingOrder() {
        MealWorkspace workspace = workspace("请安排糖水"); List<Dish> eligible = pool();
        eligible.set(202,dish(203,"糖水",null)); eligible.set(203,dish(204,"糖水",7L));
        workspace.getDraft().getLockedDishIds().add(205L);
        List<Long> ids = catalog(workspace,eligible); assertEquals(205L,ids.get(0)); assertEquals(203L,ids.get(1)); assertEquals(204L,ids.get(2));
    }
    @Test void blankRequestPreservesTheOriginalEligibleOrder() {
        List<Long> ids = catalog(workspace(""),pool()); assertEquals(200,ids.size()); assertEquals(1L,ids.get(0)); assertEquals(200L,ids.get(199));
    }
    @Test void textCannotAddAnIneligibleDishAndAnUnavailableLockStillFailsClosed() {
        MealWorkspace workspace = workspace("请找未通过硬筛选的菜"); List<Dish> eligible = pool();
        assertFalse(catalog(workspace,eligible).contains(999L)); workspace.getDraft().getLockedDishIds().add(999L);
        assertThrows(IllegalArgumentException.class,() -> catalog(workspace,eligible));
    }
    @Test void foreignPrivateDishIsRejectedEvenWhenNamedAndOutsideTheBound() {
        MealWorkspace workspace = workspace("请找别人的糖水"); List<Dish> eligible = pool(); eligible.set(204,dish(205,"别人的糖水",8L));
        assertThrows(IllegalArgumentException.class,() -> catalog(workspace,eligible));
    }
}
