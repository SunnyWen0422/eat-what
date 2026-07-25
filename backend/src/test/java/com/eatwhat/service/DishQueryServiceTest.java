package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DishQueryServiceTest {

    @Mock
    private DishMapper mapper;
    private DishQueryService service;

    @BeforeEach
    void setUp() {
        service = new DishQueryService(mapper);
    }

    @Test
    void typedListUsesPageOffsetAndUntypedListUsesAllRows() {
        service.getDishes("meat", null, 3, 20);
        verify(mapper).selectDishesByTypePage("meat", 20, 40);

        service.getDishes(null, null, 1, 20);
        verify(mapper).selectAllDishes();
    }

    @Test
    void keywordListAndSearchDelegateToSearchQueries() {
        service.getDishes(null, "tofu", 1, 20);
        verify(mapper).searchDishesByKeyword("tofu");

        service.searchDishes("chicken", "meat");
        verify(mapper).searchDishes("chicken", "meat");
    }

    @Test
    void emptyIdLookupAvoidsDatabaseCall() {
        assertTrue(service.getDishesByIds(null).isEmpty());
        assertTrue(service.getDishesByIds(Collections.emptyList()).isEmpty());
        verify(mapper, never()).selectByIds(anyList());
    }
}
