package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class AssistantTurnReadCacheTest {
 ReadResult result(){ReadResult r=new ReadResult();r.setCallId("original");r.setName("read_current_meal");r.setSourceVersion("1:1");r.getItems().add(AssistantV4ContextService.map("people",2));return r;}
 @Test void canonical_order_and_copy_do_not_change_request_identity(){AssistantTurnReadCache cache=new AssistantTurnReadCache(new ObjectMapper());Map<String,Object> a=AssistantV4ContextService.map("a",1,"b",2),b=AssistantV4ContextService.map("b",2,"a",1);cache.put("read_current_meal",a,"1:1",result());ReadResult hit=cache.find("read_current_meal",b,"1:1");assertNotNull(hit);hit.setCallId("new");hit.getItems().clear();assertEquals("original",cache.find("read_current_meal",a,"1:1").getCallId());assertEquals(1,cache.find("read_current_meal",a,"1:1").getItems().size());}
 @Test void version_cursor_and_instance_boundaries_do_not_reuse(){AssistantTurnReadCache cache=new AssistantTurnReadCache(new ObjectMapper());cache.put("read_current_meal",Collections.emptyMap(),"1:1",result());assertNull(cache.find("read_current_meal",Collections.emptyMap(),"1:2"));assertNull(cache.find("read_current_meal",Collections.singletonMap("cursor","next"),"1:1"));assertNull(new AssistantTurnReadCache(new ObjectMapper()).find("read_current_meal",Collections.emptyMap(),"1:1"));}
 @Test void unknown_freshness_or_changed_result_is_not_cached(){AssistantTurnReadCache cache=new AssistantTurnReadCache(new ObjectMapper());cache.put("read_current_meal",Collections.emptyMap(),null,result());assertNull(cache.find("read_current_meal",Collections.emptyMap(),null));cache.put("read_current_meal",Collections.emptyMap(),"different",result());assertNull(cache.find("read_current_meal",Collections.emptyMap(),"different"));}
}
