package com.eatwhat.service;
import com.eatwhat.controller.DishController;
import com.eatwhat.exception.GlobalExceptionHandler;
import com.eatwhat.mapper.DishMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class RetiredDishDetailTest {
 @Test void retiredPublicRecipeReportsGoneInsteadOfUnknown404() throws Exception {
  DishMapper mapper=mock(DishMapper.class,invocation->invocation.getMethod().getName().equals("countRetiredPublic")?1:org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation));
  MockMvcBuilders.standaloneSetup(new DishController(new DishQueryService(mapper),mock(CustomDishService.class))).setControllerAdvice(new GlobalExceptionHandler()).build()
   .perform(get("/dishes/39409").requestAttr("currentUserId",1L)).andExpect(status().isGone()).andExpect(jsonPath("message").value("菜品已下架"));
 }
 @Test void unknownOrInaccessibleDishRemains404AndAnonymousRemains401() throws Exception {
  DishMapper mapper=mock(DishMapper.class);
  org.springframework.test.web.servlet.MockMvc mvc=MockMvcBuilders.standaloneSetup(new DishController(new DishQueryService(mapper),mock(CustomDishService.class))).setControllerAdvice(new GlobalExceptionHandler()).build();
  mvc.perform(get("/dishes/1").requestAttr("currentUserId",1L)).andExpect(status().isNotFound());
  mvc.perform(get("/dishes/1")).andExpect(status().isUnauthorized());
 }
}
