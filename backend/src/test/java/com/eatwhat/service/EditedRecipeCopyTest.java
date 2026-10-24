package com.eatwhat.service;

import com.eatwhat.dto.CatalogQuality;
import com.eatwhat.dto.DishWriteRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Drafts do not write; one authenticated transaction creates the final edited copy. */
class EditedRecipeCopyTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PersonalDishMapper dishes = mock(PersonalDishMapper.class);
    private final MealConsumptionMapper logs = mock(MealConsumptionMapper.class);
    private final DishQualityMapper quality = mock(DishQualityMapper.class);
    private final Map<String,Object> receipt = new HashMap<>();
    private final CanonicalCatalogService catalog=CanonicalTestCatalog.service();
    private Dish source() {Dish source=CanonicalTestCatalog.fish(1);source.setTips("少盐");source.setStepImages("[\"https://example.com/step.jpg\"]");CanonicalTestCatalog.changed(source,r->r.put("imageUrl","https://example.com/fish.jpg"));catalog.enrich(source);return source;}
    private CustomDishService service(Dish source) {
        when(logs.lockUser(7L)).thenReturn(7L);
        when(logs.request(7L,"copy-edit")).thenAnswer(call -> receipt.isEmpty() ? null : receipt);
        doAnswer(call -> { receipt.put("requestHash",call.getArgument(2)); receipt.put("responseJson",call.getArgument(3)); return 1; })
            .when(logs).log(eq(7L),eq("copy-edit"),anyString(),anyString());
        when(dishes.lockReadable(1L,7L)).thenReturn(source);
        doAnswer(call -> { ((Dish)call.getArgument(0)).setId(9L); return 1; }).when(dishes).insert(any(Dish.class));
        CustomDishService service = new CustomDishService(mock(DishMapper.class),null,dishes,logs,json);
        CanonicalTestCatalog.wire(service,catalog);service.setQuality(CanonicalTestCatalog.quality(catalog)); return service;
    }
    private DishWriteRequest request(Dish source) throws Exception {
        Map<String,Object> body = new LinkedHashMap<>(); body.put("requestId","copy-edit"); body.put("expectedVersion",source.getContentVersion());
        body.put("editCopy",true); body.put("name","我的清蒸鱼"); body.put("type",source.getType());
        body.put("cl",source.getIngredientsAmounts()); body.put("step",source.getSteps()); body.put("cookMinutes",source.getCookMinutes());
        DishWriteRequest request=json.readValue(json.writeValueAsString(body),DishWriteRequest.class);request.setRecipe(source.getRecipe().deepCopy());((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe()).put("name","我的清蒸鱼");return request;
    }
    @Test void editedCopyPreservesUntouchedRichContentImageEvidenceAndDoesOneInsert() throws Exception {
        Dish source=source();String original=source.getRecipeJson();CustomDishService service=service(source);Dish copy=service.copyDish(7L,1L,request(source));assertEquals("我的清蒸鱼",copy.getName());assertEquals(7L,copy.getUserId());assertEquals(9L,copy.getId());assertEquals(source.getIngredientsAmounts(),copy.getIngredientsAmounts());assertEquals(source.getSteps(),copy.getSteps());assertEquals(source.getImage(),copy.getImage());assertEquals(source.getTips(),copy.getTips());assertNull(copy.getQuality());assertEquals(original,source.getRecipeJson());verify(dishes,times(1)).insert(any());verify(dishes,times(1)).update(argThat(d->d.getId()==9));verifyNoInteractions(quality);
    }
    @Test void changingRecipeInDraftInvalidatesInheritedClaimsButKeepsProvenance() throws Exception {
        Dish source=source();CustomDishService service=service(source);DishWriteRequest request=request(source);((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("ingredients").get(0)).put("quantity",150);((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("steps").get(0)).put("text","改为煎熟");((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe()).put("imageUrl","https://example.com/new.jpg");Dish copy=service.copyDish(7L,1L,request);assertEquals(150,copy.getRecipe().path("ingredients").get(0).path("quantity").asInt());assertTrue(copy.getSteps().startsWith("改为煎熟"));assertEquals("https://example.com/new.jpg",copy.getImage());assertNull(copy.getQuality());assertEquals(100,source.getRecipe().path("ingredients").get(0).path("quantity").asInt());
    }
    @Test void editedCopyReplayReturnsSavedIdentityEvenAfterSourceChanges() throws Exception {
        Dish source=source(); CustomDishService service=service(source); DishWriteRequest request=request(source);
        Dish first=service.copyDish(7L,1L,request); source.setSteps("源内容随后变化");
        Dish recovered=service.copyDish(7L,1L,request); assertEquals(first.getId(),recovered.getId()); assertEquals(first.getContentVersion(),recovered.getContentVersion());
        verify(dishes,times(1)).insert(any()); request.setName("不同内容");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.copyDish(7L,1L,request));
    }
    @Test void editedCopyRejectsVersionDriftAndInvalidImageBeforeAnyInsert() throws Exception {
        Dish source=source(); CustomDishService service=service(source); DishWriteRequest request=request(source); request.setExpectedVersion("stale");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.copyDish(7L,1L,request));
        request.setExpectedVersion(source.getContentVersion()); request.setEditImage(true); request.setImage("javascript:bad");((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe()).put("imageUrl","javascript:bad");
        assertThrows(IllegalArgumentException.class,()->service.copyDish(7L,1L,request)); verify(dishes,never()).insert(any());
    }
    @Test void legacyCopyBodyOmitsNewFieldSoPersistedReceiptHashRemainsCompatible() throws Exception {
        Dish source=source(); CustomDishService service=service(source); DishWriteRequest legacy=new DishWriteRequest();
        legacy.setRequestId("copy-edit"); legacy.setExpectedVersion(source.getContentVersion());
        assertFalse(json.writeValueAsString(legacy).contains("editCopy"));
        Dish first=service.copyDish(7L,1L,legacy); assertEquals(source.getName(),first.getName());
        assertEquals(first.getId(),service.copyDish(7L,1L,legacy).getId()); verify(dishes,times(1)).insert(any());
    }
    @Test void sideCategoryRemainsSideAcrossCopyEditAndCreate() throws Exception {
        Dish source=source();CanonicalTestCatalog.changed(source,r->r.put("categoryCode","CAT_SIDE"));catalog.enrich(source);CustomDishService service=service(source);Dish copy=service.copyDish(7L,1L,request(source));assertEquals("side",copy.getType());Dish owned=source();owned.setUserId(7L);owned.setIsCustom(1);CanonicalTestCatalog.changed(owned,r->r.put("categoryCode","CAT_SIDE"));when(dishes.lockReadable(1L,7L)).thenReturn(owned);when(dishes.update(any())).thenReturn(1);when(logs.request(7L,"side-edit")).thenReturn(null);when(logs.request(7L,"side-create")).thenReturn(null);DishWriteRequest edit=request(owned);edit.setRequestId("side-edit");assertEquals("side",service.updatePersonalDish(7L,1L,edit).getType());DishWriteRequest create=request(source);create.setRequestId("side-create");assertEquals("side",service.createPersonalDish(7L,create).getType());
    }
    @Test void dedicatedEditedRouteRequiresIdentityAndCannotFallBackToLegacyCopySemantics() throws Exception {
        CustomDishService service=mock(CustomDishService.class);
        com.eatwhat.controller.DishController controller = new com.eatwhat.controller.DishController(mock(DishQueryService.class),service);
        javax.servlet.http.HttpServletRequest http=mock(javax.servlet.http.HttpServletRequest.class); DishWriteRequest request=new DishWriteRequest();
        java.lang.reflect.Method route=controller.getClass().getMethod("copyEditedDish",Long.class,DishWriteRequest.class,javax.servlet.http.HttpServletRequest.class);
        assertEquals("/{id}/copy-edited",route.getAnnotation(org.springframework.web.bind.annotation.PostMapping.class).value()[0]);
        assertEquals(401,((org.springframework.http.ResponseEntity<?>)route.invoke(controller,1L,request,http)).getStatusCodeValue()); verifyNoInteractions(service);
        when(http.getAttribute("currentUserId")).thenReturn(7L); Dish returned=source();when(service.copyDish(7L,1L,request)).thenReturn(returned);
        assertEquals(200,((org.springframework.http.ResponseEntity<?>)route.invoke(controller,1L,request,http)).getStatusCodeValue());
        assertEquals(Boolean.TRUE,json.convertValue(request,Map.class).get("editCopy")); verify(service).copyDish(7L,1L,request);
    }
}
