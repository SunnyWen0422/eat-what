package com.eatwhat.exception;

import com.eatwhat.controller.DishController;
import com.eatwhat.service.CustomDishService;
import com.eatwhat.service.DishQueryService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {
    public static class Filter {
        private int page;
        public int getPage() { return page; }
        public void setPage(int page) { this.page = page; }
    }
    @RestController
    public static class BindingController {
        @GetMapping("/binding") public int bound(@ModelAttribute Filter filter) { return filter.getPage(); }
    }
    @Test void invalidBoundFieldsReturnSafeClientError() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new BindingController())
            .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/binding").param("page", "private-invalid-value"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("errorCode").value("INVALID_ARGUMENT"))
            .andExpect(jsonPath("message").value("请求参数格式错误"));
    }
    @Test void unexpectedBusinessFailuresRemainSafeServerErrors() throws Exception {
        DishQueryService dishes = mock(DishQueryService.class);
        when(dishes.getDishById(9L, 1L)).thenThrow(new IllegalStateException("private-server-detail"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new DishController(dishes, mock(CustomDishService.class)))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/dishes/9").requestAttr("currentUserId", 1L))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("errorCode").value("INTERNAL_ERROR"))
            .andExpect(jsonPath("message").value("服务器内部错误，请稍后重试"));
    }
    @ParameterizedTest
    @ValueSource(strings = {"/dishes?page=abc", "/dishes/lite?limit=abc", "/dishes/abc",
        "/dishes?page=999999999999999999999999", "/dishes/999999999999999999999999"})
    void invalidNumericInputsReturnSafeClientErrorBeforeBusinessCalls(String uri) throws Exception {
        DishQueryService dishes = mock(DishQueryService.class);
        CustomDishService custom = mock(CustomDishService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new DishController(dishes, custom))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get(uri).requestAttr("currentUserId", 1L))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("success").value(false))
            .andExpect(jsonPath("errorCode").value("INVALID_ARGUMENT"))
            .andExpect(jsonPath("message").value("请求参数格式错误"));
        verifyNoInteractions(dishes, custom);
    }
}
