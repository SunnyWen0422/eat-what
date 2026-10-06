package com.eatwhat.controller;
import com.eatwhat.dto.IngredientQuote;
import com.eatwhat.service.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.servlet.http.HttpServletRequest;
import java.util.*;
@RestController
public class IngredientPriceController {
    private final ShanghaiPriceService prices;
    private final AdminAuthorizationService admins;
    private final AdminAuditService audit;
    public IngredientPriceController(ShanghaiPriceService prices,AdminAuthorizationService admins,AdminAuditService audit) { this.prices=prices;this.admins=admins;this.audit=audit; }
    @PostMapping("/ingredient-prices/query")
    public ResponseEntity<?> query(@RequestBody Query request) {
        try { return ResponseEntity.ok(prices.query(request.items)); }
        catch(IllegalArgumentException e) { return ResponseEntity.unprocessableEntity().body(Collections.singletonMap("message",e.getMessage())); }
    }
    @PostMapping("/admin/ingredient-prices/import")
    public ResponseEntity<?> upload(@RequestParam MultipartFile file,@RequestParam String sourceUrl,@RequestParam String quoteDate,HttpServletRequest req) throws Exception {
        Long user=(Long)req.getAttribute("currentUserId");
        if(!admins.isAdmin(user)) return ResponseEntity.status(403).build();
        try {
            Map<String,Object> result=prices.importFile(file.getBytes(),sourceUrl,quoteDate);
            audit.record(user,null,null,"PRICE_IMPORT","SUCCESS","status",result,null);
            return ResponseEntity.ok(result);
        } catch(IllegalArgumentException e) { return ResponseEntity.unprocessableEntity().body(Collections.singletonMap("message",e.getMessage())); }
    }
    @PostMapping("/admin/ingredient-prices/mapping")
    public ResponseEntity<?> mapping(@RequestBody IngredientQuote mapping,HttpServletRequest req) {
        Long user=(Long)req.getAttribute("currentUserId");
        if(!admins.isAdmin(user)) return ResponseEntity.status(403).build();
        try { prices.saveMapping(mapping);audit.record(user,null,null,"PRICE_MAPPING","SUCCESS","changedFields",mapping,null);return ResponseEntity.ok(Collections.singletonMap("success",true)); }
        catch(IllegalArgumentException e) { return ResponseEntity.unprocessableEntity().body(Collections.singletonMap("message",e.getMessage())); }
    }
    public static class Query { public List<IngredientQuote> items; }
}
