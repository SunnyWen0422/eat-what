package com.eatwhat.controller;

import com.eatwhat.service.ControlledToolHarnessService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ControlledToolHarnessControllerTest {
    @Test void disabledWorkspaceAndMissingAuthenticationNeverInvokeTools() {
        ControlledToolHarnessService service=mock(ControlledToolHarnessService.class);
        MockHttpServletRequest request=new MockHttpServletRequest();request.setAttribute("currentUserId",1L);
        ControlledToolHarnessController disabled=new ControlledToolHarnessController(service,false);
        assertEquals(404,assertThrows(ResponseStatusException.class,()->disabled.preview(Collections.emptyMap(),request)).getStatus().value());
        assertEquals(404,assertThrows(ResponseStatusException.class,()->disabled.confirm("task",Collections.singletonMap("previewToken","token"),request)).getStatus().value());
        request.removeAttribute("currentUserId");
        ControlledToolHarnessController enabled=new ControlledToolHarnessController(service,true);
        assertEquals(401,assertThrows(ResponseStatusException.class,()->enabled.preview(Collections.emptyMap(),request)).getStatus().value());
        verifyNoInteractions(service);
    }
    @Test void confirmationCannotReplaceSavedArgumentsOrIdentity() {
        ControlledToolHarnessService service=mock(ControlledToolHarnessService.class);
        ControlledToolHarnessController controller=new ControlledToolHarnessController(service,true);
        MockHttpServletRequest request=new MockHttpServletRequest();request.setAttribute("currentUserId",9L);
        Map<String,Object> body=new LinkedHashMap<>();body.put("previewToken","token");body.put("userId",1L);
        assertThrows(IllegalArgumentException.class,()->controller.confirm("task",body,request));
        body.remove("userId");body.put("steps",Collections.emptyList());
        assertThrows(IllegalArgumentException.class,()->controller.confirm("task",body,request));
        verifyNoInteractions(service);
        controller.confirm("task",Collections.singletonMap("previewToken","token"),request);
        verify(service).confirm(9L,"task","token");
    }
}
