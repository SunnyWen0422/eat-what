package com.eatwhat.controller;

import com.eatwhat.config.PublicCatalogProperties;
import com.eatwhat.service.PublicCatalogService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import javax.servlet.http.HttpServletRequest;
import java.util.*;

/** Isolated namespace. Unsupported verbs are explicitly rejected, including implicit HEAD. */
@RestController
@RequestMapping(value = "/public/catalog/dishes", produces = MediaType.APPLICATION_JSON_VALUE)
public class PublicCatalogController {
    private final PublicCatalogService service;
    public PublicCatalogController(PublicCatalogService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest request) {
        getOnly(request); parameters(request, new HashSet<>(Arrays.asList("page", "pageSize", "type")));
        int page = integer(request.getParameter("page"), 1), pageSize = integer(request.getParameter("pageSize"), 50);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(page, pageSize, request.getParameter("type")));
    }
    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable String id, HttpServletRequest request) {
        getOnly(request); parameters(request, Collections.emptySet());
        long number = positive(id);
        if (number > PublicCatalogProperties.MAX_SAFE_ID) throw invalid();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.detail(number));
    }
    @RequestMapping(value = {"", "/{id}"}, method = {RequestMethod.HEAD, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE, RequestMethod.OPTIONS})
    public void unsupported() { throw new ResponseStatusException(HttpStatus.METHOD_NOT_ALLOWED); }
    private static void getOnly(HttpServletRequest request) { if (!"GET".equals(request.getMethod())) throw new ResponseStatusException(HttpStatus.METHOD_NOT_ALLOWED); }
    private static void parameters(HttpServletRequest request, Set<String> allowed) {
        for (Map.Entry<String,String[]> entry : request.getParameterMap().entrySet()) if (!allowed.contains(entry.getKey()) || entry.getValue().length != 1) throw invalid();
    }
    private static int integer(String text, int fallback) {
        if (text == null) return fallback;
        long value = positive(text); if (value > Integer.MAX_VALUE) throw invalid(); return (int)value;
    }
    private static long positive(String text) {
        if (text == null || text.length() > 16 || !text.matches("[1-9][0-9]*")) throw invalid();
        try { return Long.parseLong(text); } catch (NumberFormatException bad) { throw invalid(); }
    }
    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST); }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> rejected(ResponseStatusException error) {
        HttpStatus status = error.getStatus(); String code;
        if (status == HttpStatus.BAD_REQUEST) code = "PUBLIC_CATALOG_INVALID";
        else if (status == HttpStatus.NOT_FOUND) code = "PUBLIC_RECIPE_UNAVAILABLE";
        else if (status == HttpStatus.METHOD_NOT_ALLOWED) code = "PUBLIC_CATALOG_METHOD_NOT_ALLOWED";
        else code = "PUBLIC_CATALOG_UNAVAILABLE";
        Map<String,String> body = new LinkedHashMap<>(); body.put("errorCode", code); body.put("message", "Public recipe request could not be completed");
        ResponseEntity.BodyBuilder response = ResponseEntity.status(status).cacheControl(CacheControl.noStore());
        if (status == HttpStatus.METHOD_NOT_ALLOWED) response.header(HttpHeaders.ALLOW, "GET");
        return response.body(body);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> unavailable(Exception error) {
        return rejected(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
    }
}
