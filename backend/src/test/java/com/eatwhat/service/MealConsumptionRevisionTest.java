package com.eatwhat.service;
import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.controller.MealConsumptionController;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.http.ResponseEntity;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MealConsumptionRevisionTest {
 @Test void retiredHttpCommandReturnsGoneWithoutWritingEvenForOldReplay(){
  MealConsumptionService service=mock(MealConsumptionService.class);MealConsumptionController controller=new MealConsumptionController(service);MockHttpServletRequest http=new MockHttpServletRequest();http.setAttribute("currentUserId",1L);MealConsumptionRequest body=new MealConsumptionRequest();body.setRequestId("previous-request");body.setStatus("eaten");
  ResponseEntity<?> response=(ResponseEntity<?>)controller.save("2026-10-25","dinner",body,http);assertEquals(410,response.getStatusCodeValue());verifyNoInteractions(service);
 }
}
