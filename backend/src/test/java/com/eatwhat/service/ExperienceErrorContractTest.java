package com.eatwhat.service;

import com.eatwhat.controller.RecommendController;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExperienceErrorContractTest {
    private static final String PRIVATE = "SELECT secret FROM private_token path=C:/private";
    @Test void unexpectedRecommendationFailureKeepsSafeLegacyShape() {
        FavoriteDishService favorites=mock(FavoriteDishService.class);
        when(favorites.getFavoriteDishIds(1L)).thenThrow(new IllegalStateException(PRIVATE));
        RecommendController controller=new RecommendController(mock(RecommendationService.class),favorites);
        MockHttpServletRequest request=new MockHttpServletRequest();request.setAttribute("currentUserId",1L);
        Map<?,?> body=(Map<?,?>)controller.recommend(new RecommendRequest(),request).getBody();
        assertEquals(false,body.get("success"));
        assertEquals("INTERNAL_ERROR",body.get("errorCode"));
        assertEquals("推荐暂未完成，请稍后重试",body.get("message"));
        assertFalse(body.toString().contains("SELECT"));
    }
    @Test void singleRecommendationNeverEchoesUpstreamFailure() {
        RecommendationService service=mock(RecommendationService.class);
        when(service.getSingleRecommendation("meat",java.util.Collections.emptyList())).thenThrow(new IllegalStateException(PRIVATE));
        MockHttpServletRequest request=new MockHttpServletRequest();request.setAttribute("currentUserId",1L);
        Map<?,?> body=(Map<?,?>)new RecommendController(service,mock(FavoriteDishService.class)).recommendSingle("meat",null,request).getBody();
        assertEquals("INTERNAL_ERROR",body.get("errorCode"));
        assertFalse(body.toString().contains("secret"));
    }
    @Test void unknownFailureLogsOnlySafeMetadata() {
        Logger logger=(Logger)LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> appender=new ListAppender<>();appender.start();logger.addAppender(appender);
        try {
            new GlobalExceptionHandler().handleException(new IllegalStateException(PRIVATE));
            assertFalse(appender.list.isEmpty());
            for(ILoggingEvent event:appender.list) {
                assertFalse(event.getFormattedMessage().contains(PRIVATE));
                assertNull(event.getThrowableProxy(),"untrusted exception message must not reach diagnostic logs");
            }
        } finally {logger.detachAppender(appender);appender.stop();}
    }
    @Test void metricsCannotCreateLabelsFromPrivateInputs() {
        io.micrometer.core.instrument.simple.SimpleMeterRegistry registry=new io.micrometer.core.instrument.simple.SimpleMeterRegistry();
        ExperienceMetrics metrics=new ExperienceMetrics(registry);
        metrics.recordStage("candidate_scan","success",12,256);
        assertEquals(1,registry.find("eatwhat.experience.duration").timer().count());
        assertThrows(IllegalArgumentException.class,()->metrics.recordStage(PRIVATE,"success",1,1));
        assertThrows(IllegalArgumentException.class,()->metrics.recordStage("model_http",PRIVATE,1,1));
        assertThrows(IllegalArgumentException.class,()->metrics.recordStage("model_http","success",-1,1));
        assertEquals(2,registry.getMeters().size());
    }
}
