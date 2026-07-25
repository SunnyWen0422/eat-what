package com.eatwhat.controller;

import com.eatwhat.entity.Dish;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.service.CustomDishService;
import com.eatwhat.service.AdminAuthorizationService;
import com.eatwhat.service.DishQueryService;
import com.eatwhat.service.FavoriteDishService;
import com.eatwhat.service.RecommendationService;
import com.eatwhat.service.RecommendationMetadataService;
import com.eatwhat.config.RecommendationFeatureProperties;
import com.eatwhat.service.RecipeRecordService;
import com.eatwhat.service.UserService;
import com.eatwhat.service.AdminUserService;
import com.eatwhat.dto.AdminUserPageDTO;
import com.eatwhat.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ControllerBehaviorTest {

    private final DishQueryService dishQueryService = mock(DishQueryService.class);
    private final CustomDishService customDishService = mock(CustomDishService.class);
    private final RecommendationService recommendationService = mock(RecommendationService.class);
    private final FavoriteDishService favoriteService = mock(FavoriteDishService.class);
    private final RecipeRecordService recordService = mock(RecipeRecordService.class);
    private final UserService userService = mock(UserService.class);
    private final AdminAuthorizationService adminAuthorizationService = mock(AdminAuthorizationService.class);
    private final AdminUserService adminUserService = mock(AdminUserService.class);
    private MockHttpServletRequest authenticated;

    @BeforeEach
    void setUp() {
        authenticated = new MockHttpServletRequest();
        authenticated.setAttribute("currentUserId", 7L);
    }

    @Test
    void dishControllerRequiresIdentityAndReturnsPagedEnvelope() {
        DishController controller = new DishController(dishQueryService, customDishService);
        assertEquals(401, controller.getDishes(null, null, null, null, null, null, null, null, 1, 20, new MockHttpServletRequest()).getStatusCodeValue());

        Dish dish = new Dish();
        dish.setId(1L);
        when(dishQueryService.getFilteredDishes(eq(7L), eq("meat"), isNull(), any(), eq(2), eq(10)))
                .thenReturn(new DishPageDTO(Collections.singletonList(dish), 42, 2, 10));
        ResponseEntity<?> response = controller.getDishes("meat", null, null, null, null, null, null, null, 2, 10, authenticated);

        assertEquals(200, response.getStatusCodeValue());
        DishPageDTO body = (DishPageDTO) response.getBody();
        assertEquals(42, body.getTotal());
        assertEquals(2, body.getPage());
    }

    @Test
    void recommendationReturnsPlansAndFavoritesForCurrentUser() {
        RecommendController controller = new RecommendController(recommendationService, favoriteService);
        when(recommendationService.generatePlans(any(), any(), anySet(), anySet(), eq(7L))).thenReturn(Collections.emptyList());
        when(favoriteService.getFavoriteDishIds(7L)).thenReturn(Collections.singletonList(9L));

        ResponseEntity<?> response = controller.recommend(new com.eatwhat.dto.RecommendRequest(), authenticated);
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(Boolean.TRUE, ((Map<?, ?>) response.getBody()).get("success"));
    }

    @Test
    void recommendationRejectsUnknownCodesBeforeQueryingCandidates() {
        RecommendationMetadataService metadataService = mock(RecommendationMetadataService.class);
        when(metadataService.validateCriteria(any())).thenReturn(Collections.singletonMap("cuisineCodes", "Unknown cuisine codes: INVALID"));
        RecommendController controller = new RecommendController(
                recommendationService, favoriteService, null, metadataService, null);
        com.eatwhat.dto.RecommendRequest request = new com.eatwhat.dto.RecommendRequest();
        com.eatwhat.dto.RecommendationCriteria criteria = new com.eatwhat.dto.RecommendationCriteria();
        criteria.setCuisineCodes(Collections.singletonList("INVALID"));
        request.setCriteria(criteria);

        ResponseEntity<?> response = controller.recommend(request, authenticated);

        assertEquals(400, response.getStatusCodeValue());
        assertTrue(((Map<?, ?>) response.getBody()).containsKey("errors"));
        verifyNoInteractions(recommendationService);
    }

    @Test
    void disabledPreferenceFeatureUsesBackwardCompatibleCountOnlyRequest() {
        RecommendationMetadataService metadataService = mock(RecommendationMetadataService.class);
        RecommendController controller = new RecommendController(
                recommendationService, favoriteService, null, metadataService, null,
                new RecommendationFeatureProperties(false));
        com.eatwhat.dto.RecommendRequest request = new com.eatwhat.dto.RecommendRequest();
        com.eatwhat.dto.RecommendationCriteria criteria = new com.eatwhat.dto.RecommendationCriteria();
        criteria.setCuisineCodes(Collections.singletonList("REMOVED_CODE"));
        request.setCriteria(criteria);
        when(favoriteService.getFavoriteDishIds(7L)).thenReturn(Collections.emptyList());
        when(recommendationService.generatePlans(any(), any(), anySet(), anySet(), eq(7L))).thenReturn(Collections.emptyList());

        ResponseEntity<?> response = controller.recommend(request, authenticated);

        assertEquals(200, response.getStatusCodeValue());
        verify(recommendationService).generatePlans(
                argThat(value -> value.getCriteria().getCuisineCodes().isEmpty()),
                any(), anySet(), anySet(), eq(7L));
        verify(metadataService, never()).validateCriteria(any());
    }

    @Test
    void favoriteAddValidatesDishAndUsesAuthenticatedUser() {
        FavoriteDishController controller = new FavoriteDishController();
        ReflectionTestUtils.setField(controller, "favoriteDishService", favoriteService);
        assertEquals(400, controller.addFavorite(Collections.emptyMap(), authenticated).getStatusCodeValue());

        when(favoriteService.addFavorite(7L, 9L)).thenReturn(true);
        assertEquals(200, controller.addFavorite(Collections.singletonMap("dishId", 9L), authenticated).getStatusCodeValue());
        verify(favoriteService).addFavorite(7L, 9L);
    }

    @Test
    void recipeSaveRejectsInvalidDateBeforePersistence() {
        RecipeRecordController controller = new RecipeRecordController();
        ReflectionTestUtils.setField(controller, "recipeRecordService", recordService);
        RecipeRecord record = new RecipeRecord();
        record.setMealType("dinner");
        record.setRecipeName("test");
        record.setRecordDateString("2026-02-30");

        assertEquals(400, controller.saveRecipeRecord(record, authenticated).getStatusCodeValue());
        verifyNoInteractions(recordService);
    }

    @Test
    void userLoginValidatesCodeAndPhoneLoginIsExplicitlyGone() {
        UserController controller = new UserController(userService, adminAuthorizationService);
        assertEquals(400, controller.login(new HashMap<>()).getStatusCodeValue());
        assertEquals(410, controller.phoneLogin().getStatusCodeValue());
    }

    @Test
    void adminControllerRequiresExplicitAdminAuthorization() {
        AdminController controller = new AdminController(adminUserService, customDishService, adminAuthorizationService);
        when(adminAuthorizationService.isAdmin(7L)).thenReturn(false);

        assertEquals(403, controller.listUsers(null, 1, 20, authenticated).getStatusCodeValue());
        verifyNoInteractions(adminUserService, customDishService);
    }

    @Test
    void adminControllerReturnsPagedUsersAndRejectsMissingDishOwner() {
        AdminController controller = new AdminController(adminUserService, customDishService, adminAuthorizationService);
        when(adminAuthorizationService.isAdmin(7L)).thenReturn(true);
        AdminUserPageDTO page = new AdminUserPageDTO(Collections.emptyList(), 0, 1, 20, "张三");
        when(adminUserService.listUsers("张三", 1, 20)).thenReturn(page);

        ResponseEntity<?> listResponse = controller.listUsers("张三", 1, 20, authenticated);
        assertEquals(200, listResponse.getStatusCodeValue());
        assertSame(page, listResponse.getBody());

        Dish dish = new Dish();
        dish.setName("测试菜");
        dish.setType("veg");
        when(adminUserService.findUser(99L)).thenReturn(null);
        assertEquals(404, controller.addDish(99L, dish, authenticated).getStatusCodeValue());
        verify(customDishService, never()).createDish(any(), any());
    }
}
