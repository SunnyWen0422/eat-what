package com.eatwhat.controller;
import com.eatwhat.dto.MenuWriteRequest;
import com.eatwhat.service.PersonalMenuService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/menus")
public class MenuController {
    private final PersonalMenuService menus;
    public MenuController(PersonalMenuService menus) { this.menus=menus; }
    private Long user(HttpServletRequest request) {
        Object id=request.getAttribute("currentUserId");
        if(!(id instanceof Long))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return (Long)id;
    }
    @GetMapping public ResponseEntity<?> list(HttpServletRequest request) { return ResponseEntity.ok(menus.list(user(request))); }
    @GetMapping("/{id}") public ResponseEntity<?> get(@PathVariable Long id,HttpServletRequest request) { return ResponseEntity.ok(menus.get(user(request),id)); }
    @PostMapping public ResponseEntity<?> create(@RequestBody MenuWriteRequest body,HttpServletRequest request) { return ResponseEntity.ok(menus.save(user(request),null,body)); }
    @PutMapping("/{id}") public ResponseEntity<?> update(@PathVariable Long id,@RequestBody MenuWriteRequest body,HttpServletRequest request) { return ResponseEntity.ok(menus.save(user(request),id,body)); }
    @DeleteMapping("/{id}") public ResponseEntity<?> delete(@PathVariable Long id,@RequestBody MenuWriteRequest body,HttpServletRequest request) { return ResponseEntity.ok(menus.delete(user(request),id,body)); }
    @PostMapping("/{id}/resolve") public ResponseEntity<?> resolve(@PathVariable Long id,@RequestBody MenuWriteRequest body,HttpServletRequest request) { return ResponseEntity.ok(menus.resolve(user(request),id,body)); }
}
