package com.eatwhat.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class MealWorkspaceHttpTransportTest {
    @Test void unauthenticatedPostExposesReal401ResponseWithoutRetryingOrLosingRequestBody() throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        AtomicInteger requests=new AtomicInteger();
        AtomicReference<String> method=new AtomicReference<>(),body=new AtomicReference<>(),authorization=new AtomicReference<>();
        server.createContext("/shopping-list:clear",exchange->{
            requests.incrementAndGet();method.set(exchange.getRequestMethod());authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            try(InputStream input=exchange.getRequestBody();ByteArrayOutputStream payload=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[256];int count;
                while((count=input.read(buffer))!=-1)payload.write(buffer,0,count);
                body.set(new String(payload.toByteArray(),StandardCharsets.UTF_8));
            }
            byte[] response="{\"message\":\"login required\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(401,response.length);
            try(OutputStream output=exchange.getResponseBody()) {output.write(response);}
        });
        server.start();
        try {
            TestRestTemplate http=new TestRestTemplate();MealWorkspaceHttpIT.configureHttpTransport(http);
            HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<Map> response=http.postForEntity("http://127.0.0.1:"+server.getAddress().getPort()+"/shopping-list:clear",new HttpEntity<>(Collections.singletonMap("requestId","unauthorized-post"),headers),Map.class);
            assertEquals(401,response.getStatusCodeValue());assertEquals("login required",response.getBody().get("message"));
            assertEquals(1,requests.get());assertEquals("POST",method.get());assertNull(authorization.get());assertTrue(body.get().contains("unauthorized-post"));
        } finally {server.stop(0);}
    }
}
