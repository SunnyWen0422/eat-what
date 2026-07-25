package com.eatwhat.service;

import com.eatwhat.entity.FavoriteDish;
import com.eatwhat.mapper.FavoriteDishMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FavoriteDishServiceTest {

    @Mock
    private FavoriteDishMapper mapper;
    private FavoriteDishService service;

    @BeforeEach
    void setUp() {
        service = new FavoriteDishService();
        ReflectionTestUtils.setField(service, "favoriteDishMapper", mapper);
    }

    @Test
    void favoriteCrudAndQueriesDelegateWithUserScope() {
        when(mapper.insert(any(FavoriteDish.class))).thenReturn(1);
        assertTrue(service.addFavorite(7L, 9L));
        verify(mapper).insert(argThat(value -> value.getUserId().equals(7L) && value.getDishId().equals(9L)));

        when(mapper.delete(7L, 9L)).thenReturn(1);
        when(mapper.isFavorite(7L, 9L)).thenReturn(1);
        when(mapper.selectDishIdsByUser(7L)).thenReturn(Arrays.asList(9L, 10L));
        when(mapper.selectFavoritesByUser(7L)).thenReturn(Collections.emptyList());

        assertTrue(service.removeFavorite(7L, 9L));
        assertTrue(service.isFavorite(7L, 9L));
        assertEquals(Arrays.asList(9L, 10L), service.getFavoriteDishIds(7L));
        assertTrue(service.getFavorites(7L).isEmpty());
    }
}
