package com.eatwhat.controller;

import com.eatwhat.dto.ShoppingBatchAddRequest;
import com.eatwhat.dto.ShoppingClearRequest;
import com.eatwhat.dto.ShoppingItemPatchRequest;
import com.eatwhat.dto.ShoppingListResponse;
import com.eatwhat.dto.ShoppingPreviewRequest;
import com.eatwhat.dto.ShoppingPreviewResponse;
import com.eatwhat.dto.ShoppingSyncResponse;
import com.eatwhat.service.ShoppingListService;
import com.eatwhat.service.ShoppingPreviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping
public class ShoppingListController {
    private final ShoppingPreviewService previewService;
    private final ShoppingListService listService;

    public ShoppingListController(ShoppingPreviewService previewService, ShoppingListService listService) {
        this.previewService = previewService;
        this.listService = listService;
    }

    @PostMapping("/shopping-list/preview")
    public ResponseEntity<?> preview(@RequestBody ShoppingPreviewRequest request, HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok(previewService.createPreview(userId(httpRequest), request));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error(e.getMessage()));
        }
    }

    @PostMapping("/shopping-list/items:batch-add")
    public ResponseEntity<?> batchAdd(@RequestBody ShoppingBatchAddRequest request, HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok(listService.batchAdd(userId(httpRequest), request));
        } catch (ShoppingListService.VersionConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict(e));
        } catch (ShoppingListService.NotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error(e.getMessage()));
        }
    }

    @GetMapping("/shopping-list")
    public ResponseEntity<ShoppingListResponse> getList(@RequestParam(defaultValue = "all") String status,
                                                         HttpServletRequest httpRequest) {
        return ResponseEntity.ok(listService.getList(userId(httpRequest), status));
    }

    @PatchMapping("/shopping-list/items/{itemId}")
    public ResponseEntity<?> patchItem(@PathVariable Long itemId, @RequestBody ShoppingItemPatchRequest request,
                                       HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok(listService.patchItem(userId(httpRequest), itemId, request));
        } catch (ShoppingListService.VersionConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict(e));
        } catch (ShoppingListService.NotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error(e.getMessage()));
        }
    }

    @DeleteMapping("/shopping-list/items/{itemId}")
    public ResponseEntity<?> deleteItem(@PathVariable Long itemId,
                                        @RequestBody(required = false) ShoppingItemPatchRequest request,
                                        HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok(listService.deleteItem(userId(httpRequest), itemId,
                    request == null ? null : request.getExpectedListVersion()));
        } catch (ShoppingListService.VersionConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict(e));
        } catch (ShoppingListService.NotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error(e.getMessage()));
        }
    }

    @PostMapping({"/shopping-list:clear", "/shopping-list/:clear"})
    public ResponseEntity<?> clear(@RequestBody ShoppingClearRequest request, HttpServletRequest httpRequest) {
        try {
            return ResponseEntity.ok(listService.clear(userId(httpRequest), request));
        } catch (ShoppingListService.VersionConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict(e));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error(e.getMessage()));
        }
    }

    private Long userId(HttpServletRequest request) {
        Object value = request.getAttribute("currentUserId");
        if (value instanceof Number) return ((Number) value).longValue();
        throw new IllegalArgumentException("用户未登录");
    }

    private java.util.Map<String, Object> error(String message) {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("success", false);
        result.put("message", message == null ? "请求无效" : message);
        return result;
    }

    private java.util.Map<String, Object> conflict(ShoppingListService.VersionConflictException exception) {
        java.util.Map<String, Object> result = error(exception.getMessage());
        result.put("errorCode", "SHOPPING_LIST_VERSION_CONFLICT");
        result.put("serverVersion", exception.getServerVersion());
        return result;
    }
}
