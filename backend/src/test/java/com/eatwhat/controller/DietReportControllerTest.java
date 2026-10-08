package com.eatwhat.controller;

import com.eatwhat.service.MealConsumptionService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.Collections;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DietReportControllerTest {
    @Test void reportReadIsAuthenticatedScopedAndNeverStoredByHttpCaches() throws Exception {
        MealConsumptionService service=mock(MealConsumptionService.class);
        when(service.review(4L,"2026-01-01","2026-01-07")).thenReturn(Collections.singletonMap("mealCount",0));
        MockMvc mvc=MockMvcBuilders.standaloneSetup(new MealConsumptionController(service)).build();
        mvc.perform(get("/diet-reviews").param("startDate","2026-01-01").param("endDate","2026-01-07").requestAttr("currentUserId",4L))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.mealCount").value(0));
        verify(service).review(4L,"2026-01-01","2026-01-07");
    }
}
