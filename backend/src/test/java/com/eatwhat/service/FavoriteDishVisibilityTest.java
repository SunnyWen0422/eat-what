package com.eatwhat.service;

import com.eatwhat.controller.FavoriteDishController;
import com.eatwhat.mapper.FavoriteDishMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import java.util.Collections;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FavoriteDishVisibilityTest {
    private FavoriteDishService service(FavoriteDishMapper mapper) {
        FavoriteDishService service = new FavoriteDishService();
        ReflectionTestUtils.setField(service, "favoriteDishMapper", mapper);
        return service;
    }

    @Test void deniedOrMissingDishUsesTheSameNotFoundOutcome() {
        FavoriteDishMapper mapper = mock(FavoriteDishMapper.class);
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service(mapper).addFavorite(11L, 44L));
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("菜品不存在或不可访问", error.getReason());
    }

    @Test void unchangedDuplicateInsertStillReturnsDesiredFavoriteState() {
        FavoriteDishMapper mapper = mock(FavoriteDishMapper.class);
        when(mapper.isFavorite(11L, 1L)).thenReturn(1);
        assertTrue(service(mapper).addFavorite(11L, 1L));
    }

    @Test void freshVisibleInsertSucceedsWithoutAnUnnecessaryRead() {
        FavoriteDishMapper mapper = mock(FavoriteDishMapper.class);
        when(mapper.insert(any())).thenReturn(1);
        assertTrue(service(mapper).addFavorite(11L, 1L));
        verify(mapper, never()).isFavorite(anyLong(), anyLong());
    }

    @Test void invalidIdentityOrDishIsRejectedBeforeMapperAccess() {
        FavoriteDishMapper mapper = mock(FavoriteDishMapper.class);
        FavoriteDishService service = service(mapper);
        assertThrows(IllegalArgumentException.class, () -> service.addFavorite(null, 1L));
        assertThrows(IllegalArgumentException.class, () -> service.addFavorite(11L, -1L));
        verifyNoInteractions(mapper);
    }

    @Test void controllerPreservesNotFoundAndRejectsAnonymousAndInvalidIds() {
        FavoriteDishService service = mock(FavoriteDishService.class);
        when(service.addFavorite(11L, 44L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "菜品不存在或不可访问"));
        FavoriteDishController controller = new FavoriteDishController();
        ReflectionTestUtils.setField(controller, "favoriteDishService", service);
        MockHttpServletRequest request = new MockHttpServletRequest();
        assertEquals(401, controller.addFavorite(Collections.singletonMap("dishId", 44L), request).getStatusCodeValue());
        request.setAttribute("currentUserId", 11L);
        assertEquals(404, controller.addFavorite(Collections.singletonMap("dishId", 44L), request).getStatusCodeValue());
        assertEquals(400, controller.addFavorite(Collections.singletonMap("dishId", -1L), request).getStatusCodeValue());
        verify(service, never()).addFavorite(11L, -1L);
    }
}
