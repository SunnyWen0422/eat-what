package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;import java.util.*;
import static org.junit.jupiter.api.Assertions.*;import static org.mockito.Mockito.*;
class AssistantSessionListTest {
    SessionSummary row(String id){SessionSummary r=new SessionSummary();r.setSessionId(id);r.setUserId(1L);r.setWorkspaceId("w");r.setUpdatedAt(100);r.setDate("2026-10-15");r.setMealType("dinner");return r;}
    AssistantV4Mapper db=mock(AssistantV4Mapper.class);
    AssistantV4Store store=new AssistantV4Store(db,mock(MealConsumptionMapper.class),mock(MealWorkspaceService.class),new ObjectMapper(),mock(TransactionTemplate.class),Clock.systemUTC());
    @Test void sameTimestampUsesIdCursorAndNeverLoadsMessages(){
        String a="ffffffff-ffff-4fff-8fff-ffffffffffff",b="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",c="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
        when(db.sessions(eq(1L),eq(Long.MAX_VALUE),eq("~"),eq(3))).thenReturn(Arrays.asList(row(a),row(b),row(c)));
        SessionList first=store.listSessions(1L,null,2);assertEquals(2,first.getSessions().size());assertNotNull(first.getNextCursor());
        when(db.sessions(1L,100,b,3)).thenReturn(Collections.singletonList(row(c)));
        SessionList second=store.listSessions(1L,first.getNextCursor(),2);assertEquals(c,second.getSessions().get(0).getSessionId());assertNull(second.getNextCursor());
        assertEquals("w",first.getSessions().get(0).getWorkspaceRef().getWorkspaceId());
        assertEquals("dinner",first.getSessions().get(0).getTarget().get("mealType"));verify(db,never()).messages(anyLong(),anyString(),anyLong(),anyInt(),anyLong());
    }
    @Test void malformedCursorLimitsAndOtherOwnersAreRejected(){
        assertThrows(IllegalArgumentException.class,()->store.listSessions(1L,"bad-cursor",20));assertThrows(IllegalArgumentException.class,()->store.listSessions(1L,null,51));
        when(db.sessions(1L,Long.MAX_VALUE,"~",21)).thenReturn(Collections.singletonList(row("x")));db.sessions(1L,Long.MAX_VALUE,"~",21).get(0).setUserId(2L);
        assertThrows(IllegalStateException.class,()->store.listSessions(1L,null,20));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->store.listSessions(null,null,20));
    }
}
