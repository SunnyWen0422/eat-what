package com.eatwhat.exception;

import com.eatwhat.controller.DishController;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerNumericTest {
    private final DishQueryService dishes = mock(DishQueryService.class);
    private MockMvc mvc;
    @BeforeEach void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new DishController(dishes,mock(CustomDishService.class)))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    @Test void malformedAndOverflowingQueryAndPathNumbersAreSafe400() throws Exception {
        for (String path : Arrays.asList("/dishes?page=abc", "/dishes?page=2147483648",
                "/dishes?pageSize=abc", "/dishes?maxCookMinutes=abc", "/dishes/lite?limit=abc",
                "/dishes/lite?limit=2147483648", "/dishes/abc", "/dishes/9223372036854775808")) {
            mvc.perform(get(path).requestAttr("currentUserId",1L)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.success").value(false)).andExpect(jsonPath("$.errorCode").value("INVALID_ARGUMENT"))
                    .andExpect(jsonPath("$.message").value("请求参数格式错误"));
        }
        verifyNoInteractions(dishes);
    }
    @Test void validNumbersReachNormalEndpoints() throws Exception {
        when(dishes.getFilteredDishes(eq(1L),isNull(),isNull(),any(),eq(2),eq(10)))
                .thenReturn(new DishPageDTO(Collections.emptyList(),0,2,10));
        mvc.perform(get("/dishes?page=2&pageSize=10").requestAttr("currentUserId",1L))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(2));
        mvc.perform(get("/dishes/lite?limit=10").requestAttr("currentUserId",1L)).andExpect(status().isOk());
        mvc.perform(get("/dishes/12").requestAttr("currentUserId",1L)).andExpect(status().isNotFound());
        verify(dishes).getDishesLite(null,null,10); verify(dishes).getDishById(12L,1L);
    }
    @Test void actualServerFailureRemainsSafe500() throws Exception {
        when(dishes.getDishesLite(null,null,10)).thenThrow(new IllegalStateException("private database details"));
        mvc.perform(get("/dishes/lite?limit=10").requestAttr("currentUserId",1L)).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.errorCode").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value("服务器内部错误，请稍后重试"));
    }
}
