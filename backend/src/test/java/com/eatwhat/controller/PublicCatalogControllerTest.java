package com.eatwhat.controller;

import com.eatwhat.config.*;
import com.eatwhat.interceptor.AuthInterceptor;
import com.eatwhat.mapper.*;
import com.eatwhat.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.handler.MappedInterceptor;
import org.springframework.web.util.ServletRequestPathUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PublicCatalogControllerTest {
    PublicCatalogProperties properties;
    PublicCatalogMapper mapper;
    MockMvc mvc;
    @BeforeEach void setup() {
        properties=new PublicCatalogProperties(); mapper=mock(PublicCatalogMapper.class);
        PublicCatalogService service=new PublicCatalogService(properties,mapper,mock(DishQualityMapper.class),new ObjectMapper());
        mvc=MockMvcBuilders.standaloneSetup(new PublicCatalogController(service)).dispatchOptions(true).build();
    }
    @Test void disabledListAndDetailReturnExplicitUnavailableJson() throws Exception {
        for(String path:Arrays.asList("/public/catalog/dishes","/public/catalog/dishes/1")) mvc.perform(get(path)).andExpect(status().isServiceUnavailable()).andExpect(content().contentTypeCompatibleWith("application/json")).andExpect(jsonPath("$.errorCode").value("PUBLIC_CATALOG_UNAVAILABLE"));
        verifyNoInteractions(mapper);
    }
    @Test void enabledEmptyListSupportsDefaultBoundedPaginationWithoutAnyLogin() throws Exception {
        properties.setEnabled(true); mvc.perform(get("/public/catalog/dishes")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.list").isEmpty()).andExpect(jsonPath("$.page").value(1)).andExpect(jsonPath("$.pageSize").value(50));
        mvc.perform(get("/public/catalog/dishes/1")).andExpect(status().isNotFound()); verifyNoInteractions(mapper);
    }
    @Test void malformedOverflowUnknownAndRepeatedParametersAreRejected() throws Exception {
        properties.setEnabled(true);
        for(String path:Arrays.asList("?page=0","?page=2147483647&pageSize=100","?page=1.5","?pageSize=101","?pageSize=-1","?type=unknown","?keyword=private","?userId=9","?page=1&page=2","?page=99999999999999999999")) mvc.perform(get("/public/catalog/dishes"+path)).andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/json"));
        for(String id:Arrays.asList("0","-1","1.5","9007199254740992","not-a-number")) mvc.perform(get("/public/catalog/dishes/"+id)).andExpect(status().isBadRequest());
        verifyNoInteractions(mapper);
    }
    @Test void onlyGetCanReadThePublicNamespaceAndNoVerbCanMutateIt() throws Exception {
        properties.setEnabled(true);
        for(String verb:Arrays.asList("HEAD","POST","PUT","PATCH","DELETE","OPTIONS")) for(String path:Arrays.asList("/public/catalog/dishes","/public/catalog/dishes/1"))
            { MvcResult result=mvc.perform(request(org.springframework.http.HttpMethod.valueOf(verb),path)).andReturn(); assertEquals(405,result.getResponse().getStatus(),verb+" "+path); assertEquals("GET",result.getResponse().getHeader("Allow")); }
        verifyNoInteractions(mapper);
    }
    static class VisibleRegistry extends InterceptorRegistry { List<Object> entries() { return getInterceptors(); } }
    static boolean matches(MappedInterceptor registered, String path) {
        MockHttpServletRequest request=new MockHttpServletRequest("GET",path); ServletRequestPathUtils.parseAndCache(request); return registered.matches(request);
    }
    @Test void originalAuthenticationRegistrationAndCorsStayIntact() throws Exception {
        TokenService tokens=mock(TokenService.class); AuthInterceptor auth=new AuthInterceptor(tokens); VisibleRegistry registry=new VisibleRegistry(); new WebMvcConfig(auth).addInterceptors(registry);
        assertEquals(1,registry.entries().size()); MappedInterceptor registered=(MappedInterceptor)registry.entries().get(0);
        for(String path:Arrays.asList("/dishes","/dishes/1","/dishes/count","/dishes/custom","/menus/1","/meal-plans/1","/favorite-dishes/1")) assertTrue(matches(registered,path),path);
        assertFalse(matches(registered,"/public/catalog/dishes")); assertFalse(matches(registered,"/users/login"));
        MockHttpServletResponse response=new MockHttpServletResponse(); assertFalse(auth.preHandle(new MockHttpServletRequest("GET","/dishes/1"),response,new Object())); assertEquals(401,response.getStatus()); verifyNoInteractions(tokens);
        CorsConfig cors=new CorsConfig("https://approved.example,*"); assertEquals(Collections.singletonList("https://approved.example"),cors.getAllowedOrigins()); assertEquals(Arrays.asList("GET","POST","PUT","PATCH","DELETE","OPTIONS"),cors.getAllowedMethods());
    }
}
