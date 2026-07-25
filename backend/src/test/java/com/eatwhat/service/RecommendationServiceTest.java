package com.eatwhat.service;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecommendationServiceTest {

    @Mock
    private DishMapper mapper;
    private RecommendationService service;

    @BeforeEach
    void setUp() {
        service = new RecommendationService(mapper);
    }

    @Test
    void recommendationsProduceThreePlansWithRequestedCountsAndNoDuplicateNames() {
        List<Dish> dishes = new ArrayList<>();
        long id = 1;
        for (String type : Arrays.asList("meat", "veg", "soup", "dessert", "staple")) {
            List<Long> ids = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                ids.add(id);
                dishes.add(dish(id, type + "-" + index, type));
                id++;
            }
            when(mapper.selectIdsByType(type)).thenReturn(ids);
        }
        when(mapper.selectByIds(anyList())).thenReturn(dishes);

        RecommendRequest request = new RecommendRequest();
        request.setMeat(2);
        request.setVeg(2);
        request.setSoup(1);
        request.setDessert(1);
        request.setStaple(1);

        List<PlanDTO> plans = service.generatePlans(request);
        assertEquals(3, plans.size());
        assertTrue(plans.stream().allMatch(plan -> plan.getDishes().size() == 7));
        List<String> names = plans.stream().flatMap(plan -> plan.getDishes().stream())
                .map(Dish::getName).collect(Collectors.toList());
        assertEquals(names.size(), names.stream().distinct().count());
    }

    @Test
    void mapperQueriesStayOnTheRequestThread() {
        String requestThread = Thread.currentThread().getName();
        List<String> queryThreads = new CopyOnWriteArrayList<>();
        for (String type : Arrays.asList("meat", "veg", "soup", "dessert", "staple")) {
            when(mapper.selectIdsByType(type)).thenAnswer(invocation -> {
                queryThreads.add(Thread.currentThread().getName());
                return Collections.singletonList(1L);
            });
        }
        when(mapper.selectByIds(anyList())).thenReturn(Collections.singletonList(dish(1L, "one", "meat")));

        service.generatePlans(new RecommendRequest());

        assertFalse(queryThreads.isEmpty());
        assertTrue(queryThreads.stream().allMatch(requestThread::equals));
    }

    @Test
    void selectedDishCountsTowardRequestedType() {
        for (String type : Arrays.asList("meat", "veg", "soup", "dessert", "staple")) {
            when(mapper.selectIdsByType(type)).thenReturn(Collections.singletonList(1L));
        }
        when(mapper.selectByIds(anyList())).thenReturn(Arrays.asList(
                dish(1L, "pool meat", "meat"), dish(2L, "pool veg", "veg"), dish(3L, "pool soup", "soup")));
        RecommendRequest request = new RecommendRequest();
        request.setMeat(1);
        request.setVeg(0);
        request.setSoup(0);
        request.setUserSelectedDishes(Collections.singletonList(dish(999L, "selected", "meat")));

        List<PlanDTO> plans = service.generatePlans(request);
        assertEquals(3, plans.size());
        assertTrue(plans.stream().allMatch(plan -> Collections.singletonList("selected").equals(plan.getDishes().stream()
                .map(Dish::getName).collect(Collectors.toList()))));
    }

    @Test
    void singleRecommendationHonorsExclusionsAndEmptyPool() {
        when(mapper.selectIdsByTypeExclude(eq("veg"), eq(Arrays.asList(1L, 2L))))
                .thenReturn(Collections.singletonList(3L));
        Dish expected = dish(3L, "broccoli", "veg");
        when(mapper.selectById(3L)).thenReturn(expected);
        assertSame(expected, service.getSingleRecommendation("veg", Arrays.asList(1L, 2L)));

        when(mapper.selectIdsByTypeExclude("soup", Collections.emptyList())).thenReturn(Collections.emptyList());
        assertNull(service.getSingleRecommendation("soup", null));
    }

    @Test
    void sessionCriteriaAreHardFiltersAndSavedPreferencesOnlyAffectRanking() {
        List<Dish> dishes = new ArrayList<>();
        long id = 1;
        for (String type : Arrays.asList("meat", "veg", "soup")) {
            List<Long> ids = new ArrayList<>();
            for (int index = 0; index < 3; index++) {
                Dish dish = dish(id, type + "-sichuan-" + index, type);
                dish.setCuisineCode("SICHUAN");
                dish.setTagCodes("HOME_STYLE");
                dish.setCookMinutes(20);
                dishes.add(dish);
                ids.add(id++);
            }
            Dish excluded = dish(id, type + "-cantonese", type);
            excluded.setCuisineCode("CANTONESE");
            excluded.setTagCodes("HOME_STYLE");
            excluded.setCookMinutes(15);
            dishes.add(excluded);
            ids.add(id++);
            when(mapper.selectIdsByType(type)).thenReturn(ids);
        }
        when(mapper.selectIdsByType("dessert")).thenReturn(Collections.emptyList());
        when(mapper.selectIdsByType("staple")).thenReturn(Collections.emptyList());
        when(mapper.selectByIds(anyList())).thenReturn(dishes);

        RecommendRequest request = new RecommendRequest();
        request.setMeat(1);
        request.setVeg(1);
        request.setSoup(1);
        request.setDessert(0);
        request.setStaple(0);
        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setCuisineCodes(Collections.singletonList("SICHUAN"));
        criteria.setMaxCookMinutes(25);
        request.setCriteria(criteria);
        UserPreferenceDTO preferences = new UserPreferenceDTO();
        preferences.setPreferredCuisineCodes(Collections.singletonList("CANTONESE"));

        List<PlanDTO> plans = service.generatePlans(request, preferences, Collections.<Long>emptySet(), Collections.<Long>emptySet());

        assertEquals(3, plans.size());
        assertTrue(plans.stream().flatMap(plan -> plan.getDishes().stream())
                .allMatch(dish -> "SICHUAN".equals(dish.getCuisineCode())));
    }

    @Test
    void multipleWantedTagsUseAnyMatchSemantics() {
        Dish spicy = dish(1L, "spicy", "meat");
        spicy.setTagCodes("SPICY");
        Dish light = dish(2L, "light", "meat");
        light.setTagCodes("LIGHT");
        Dish plain = dish(3L, "plain", "meat");
        plain.setTagCodes("HOME_STYLE");
        when(mapper.selectIdsByType("meat")).thenReturn(Arrays.asList(1L, 2L, 3L));
        for (String type : Arrays.asList("veg", "soup", "dessert", "staple")) {
            when(mapper.selectIdsByType(type)).thenReturn(Collections.emptyList());
        }
        when(mapper.selectByIds(anyList())).thenReturn(Arrays.asList(spicy, light, plain));

        RecommendRequest request = new RecommendRequest();
        request.setMeat(1);
        request.setVeg(0);
        request.setSoup(0);
        request.setDessert(0);
        request.setStaple(0);
        RecommendationCriteria criteria = new RecommendationCriteria();
        criteria.setIncludeTagCodes(Arrays.asList("SPICY", "LIGHT"));
        request.setCriteria(criteria);

        List<Long> selectedIds = service.generatePlans(request).stream()
                .flatMap(plan -> plan.getDishes().stream())
                .map(Dish::getId)
                .collect(Collectors.toList());

        Collections.sort(selectedIds);
        assertEquals(Arrays.asList(1L, 2L), selectedIds);
    }

    @Test
    void selectedDishThatViolatesPermanentExclusionIsRemovedWithWarning() {
        for (String type : Arrays.asList("meat", "veg", "soup", "dessert", "staple")) {
            when(mapper.selectIdsByType(type)).thenReturn("meat".equals(type)
                    ? Collections.singletonList(1L) : Collections.<Long>emptyList());
        }
        Dish candidate = dish(1L, "allowed", "meat");
        candidate.setTagCodes("HOME_STYLE");
        when(mapper.selectByIds(anyList())).thenReturn(Collections.singletonList(candidate));
        Dish selected = dish(99L, "fried selected", "meat");
        selected.setTagCodes("FRY");

        RecommendRequest request = new RecommendRequest();
        request.setMeat(1);
        request.setVeg(0);
        request.setSoup(0);
        request.setDessert(0);
        request.setStaple(0);
        request.setUserSelectedDishes(Collections.singletonList(selected));
        UserPreferenceDTO preferences = new UserPreferenceDTO();
        preferences.setExcludedTagCodes(Collections.singletonList("FRY"));

        List<PlanDTO> plans = service.generatePlans(request, preferences, Collections.<Long>emptySet(), Collections.<Long>emptySet());

        assertTrue(plans.stream().flatMap(plan -> plan.getDishes().stream()).noneMatch(dish -> "fried selected".equals(dish.getName())));
        assertEquals(1, service.selectedDishWarnings(request, preferences, null).size());
    }

    @Test
    void seededWeightedSamplingIsDeterministic() {
        List<Long> ids = new ArrayList<>();
        List<Dish> dishes = new ArrayList<>();
        for (long id = 1; id <= 12; id++) {
            ids.add(id);
            dishes.add(dish(id, "dish-" + id, "meat"));
        }
        when(mapper.selectIdsByType("meat")).thenReturn(ids);
        for (String type : Arrays.asList("veg", "soup", "dessert", "staple")) {
            when(mapper.selectIdsByType(type)).thenReturn(Collections.emptyList());
        }
        when(mapper.selectByIds(anyList())).thenReturn(dishes);
        RecommendRequest request = new RecommendRequest();
        request.setMeat(2);
        request.setVeg(0);
        request.setSoup(0);
        request.setDessert(0);
        request.setStaple(0);

        List<Long> first = new RecommendationService(mapper, new Random(42)).generatePlans(request).stream()
                .flatMap(plan -> plan.getDishes().stream()).map(Dish::getId).collect(Collectors.toList());
        List<Long> second = new RecommendationService(mapper, new Random(42)).generatePlans(request).stream()
                .flatMap(plan -> plan.getDishes().stream()).map(Dish::getId).collect(Collectors.toList());

        assertEquals(first, second);
    }

    private Dish dish(Long id, String name, String type) {
        Dish dish = new Dish();
        dish.setId(id);
        dish.setName(name);
        dish.setType(type);
        return dish;
    }
}
