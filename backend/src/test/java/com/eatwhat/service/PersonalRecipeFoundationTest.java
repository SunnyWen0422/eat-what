package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PersonalRecipeFoundationTest {
    private final PersonalDishMapper dishes = mock(PersonalDishMapper.class);
    private final MealConsumptionMapper logs = mock(MealConsumptionMapper.class);
    private final RecipeMapper menus = mock(RecipeMapper.class);
    private final ObjectMapper json = new ObjectMapper();
    private final CanonicalCatalogService catalog=CanonicalTestCatalog.service();
    private CustomDishService dishService() {
        when(logs.lockUser(7L)).thenReturn(7L); when(logs.request(anyLong(),anyString())).thenReturn(null);
        CustomDishService service=CanonicalTestCatalog.wire(new CustomDishService(mock(DishMapper.class),null,dishes,logs,json),catalog);service.setQuality(CanonicalTestCatalog.quality(catalog));return service;
    }
    private PersonalMenuService menuService() { when(logs.lockUser(7L)).thenReturn(7L); when(logs.request(anyLong(),anyString())).thenReturn(null); return new PersonalMenuService(menus, dishes, logs, json); }
    private Dish dish(long id) { Dish d=CanonicalTestCatalog.fish(id);d.setTips("少盐");d.setStepImages("[\"https://example.com/step.jpg\"]");catalog.enrich(d);return d; }
    private DishWriteRequest write(String id) {DishWriteRequest r=new DishWriteRequest();r.setRequestId(id);r.setRecipe(dish(1).getRecipe().deepCopy());((com.fasterxml.jackson.databind.node.ObjectNode)r.getRecipe()).put("name","我的鱼");return r;}
    private com.fasterxml.jackson.databind.node.ObjectNode recipe(Dish d){return (com.fasterxml.jackson.databind.node.ObjectNode)d.getRecipe();}
    @Test void copyUsesReadableServerSourcePreservesRichFieldsAndNeverChangesSource() {
        Dish source = dish(1); when(dishes.lockReadable(1L,7L)).thenReturn(source);
        doAnswer(call -> { ((Dish)call.getArgument(0)).setId(9L); return 1; }).when(dishes).insert(any(Dish.class));
        DishWriteRequest request = write("copy-one"); request.setExpectedVersion(source.getContentVersion());
        Dish copy = dishService().copyDish(7L,1L,request);
        assertEquals(9L,copy.getId()); assertEquals(7L,copy.getUserId()); assertEquals(source.getSteps(),copy.getSteps()); assertEquals(source.getIngredientsAmounts(),copy.getIngredientsAmounts()); assertEquals(source.getStepImages(),copy.getStepImages()); assertEquals(source.getTips(),copy.getTips()); assertEquals(source.getFl(),copy.getFl()); assertNull(source.getUserId()); assertEquals(1L,source.getId());
        verify(dishes,times(1)).update(any());
    }
    @Test void copyAndEditRejectInvisibleSourceAndStaleContent() {
        CustomDishService service = dishService(); DishWriteRequest request = write("copy-one"); request.setExpectedVersion("old");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.copyDish(7L,1L,request));
        Dish source=dish(1); source.setUserId(7L); when(dishes.lockReadable(1L,7L)).thenReturn(source);
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.copyDish(7L,1L,request));
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.updatePersonalDish(7L,1L,request)); verify(dishes,never()).update(any());
    }
    @Test void editCanonicalizesBothRecipeRepresentationsAndClearsOldStepImages() {
        Dish source=dish(1);source.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest request=write("edit-one");request.setExpectedVersion(source.getContentVersion());((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("steps").get(0)).put("text","改为煎熟");Dish updated=dishService().updatePersonalDish(7L,1L,request);assertEquals("改为煎熟",updated.getRecipe().path("steps").get(0).path("text").asText());assertTrue(updated.getSteps().startsWith("改为煎熟"));assertEquals("少盐",updated.getTips());assertNotEquals(source.getContentVersion(),updated.getContentVersion());
    }
    @Test void fingerprintsCoverRichContentButIgnoreTransportAndTimestamp() {
        Dish d=dish(1); String before=d.getContentVersion(); d.setCreateTime(new Date()); assertEquals(before,d.getContentVersion()); CanonicalTestCatalog.changed(d,r->((com.fasterxml.jackson.databind.node.ObjectNode)r.path("steps").get(0)).put("text","changed")); assertNotEquals(before,d.getContentVersion());
    }
    @Test void writeReceiptReplaysExactResultAndRejectsChangedBody() throws Exception {
        CustomDishService service=dishService(); DishWriteRequest request=write("new-one"); Map<String,Object> receipt=new HashMap<>();
        when(logs.request(7L,"new-one")).thenAnswer(call -> receipt.isEmpty()?null:receipt);
        doAnswer(call -> { receipt.put("requestHash",call.getArgument(2)); receipt.put("responseJson",call.getArgument(3)); return 1; }).when(logs).log(eq(7L),eq("new-one"),anyString(),anyString());
        doAnswer(call -> { ((Dish)call.getArgument(0)).setId(9L); return 1; }).when(dishes).insert(any());
        Dish first=service.createPersonalDish(7L,request); Dish second=service.createPersonalDish(7L,request); assertEquals(first.getId(),second.getId()); verify(dishes,times(1)).insert(any());
        request.setName("changed"); assertThrows(MealConsumptionService.VersionConflict.class,()->service.createPersonalDish(7L,request));
    }
    private CustomRecipe menu(Dish dish) { CustomRecipe menu=new CustomRecipe(); menu.setId(3L); menu.setUserId(7L); menu.setName("家常晚餐"); menu.setPeople(4); menu.setVersion(2L); menu.setDishIds(Arrays.asList(dish.getId())); menu.setDishes(Arrays.asList(dish)); return menu; }
    @Test void resolveChecksOwnerVersionDeletedAndChangedDishes() {
        PersonalMenuService service=menuService(); MenuWriteRequest request=new MenuWriteRequest(); request.setExpectedVersion(2L); request.setDate("2026-10-08"); request.setMealType("dinner");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.resolve(7L,3L,request));
        Dish d=dish(1); CustomRecipe menu=menu(d); when(menus.selectOwned(3L,7L)).thenReturn(menu); when(dishes.lockReadable(1L,7L)).thenReturn(d);
        Map<String,Object> result=service.resolve(7L,3L,request); assertEquals(3L,result.get("menuId")); assertEquals(4,result.get("people")); assertEquals("2026-10-08",result.get("menuDate"));
        request.setExpectedVersion(1L); assertThrows(MealConsumptionService.VersionConflict.class,()->service.resolve(7L,3L,request)); request.setExpectedVersion(2L);
        when(dishes.lockReadable(1L,7L)).thenReturn(null); assertThrows(MealConsumptionService.VersionConflict.class,()->service.resolve(7L,3L,request));
        CanonicalTestCatalog.changed(d,r->((com.fasterxml.jackson.databind.node.ObjectNode)r.path("steps").get(0)).put("text","changed")); when(dishes.lockReadable(1L,7L)).thenReturn(d); assertThrows(MealConsumptionService.VersionConflict.class,()->service.resolve(7L,3L,request));
    }
    @Test void menuSaveRejectsBadCountsAndSnapshotsPublicAndPrivateDishes() {
        PersonalMenuService service=menuService(); Dish a=dish(1),b=dish(2); b.setUserId(7L); when(dishes.lockReadable(1L,7L)).thenReturn(a); when(dishes.lockReadable(2L,7L)).thenReturn(b);
        MenuWriteRequest request=new MenuWriteRequest(); request.setRequestId("menu-one"); request.setName("组合"); request.setPeople(3); request.setDishIds(Arrays.asList(1L,2L)); request.setExpectedVersion(0L);
        CustomRecipe saved=service.save(7L,null,request); assertEquals(2,saved.getDishes().size()); assertEquals(1L,saved.getVersion()); assertEquals(7L,saved.getUserId());
        request.setPeople(51); assertThrows(IllegalArgumentException.class,()->service.save(7L,null,request)); request.setPeople(3); request.setDishIds(Arrays.asList(1L,1L)); assertThrows(IllegalArgumentException.class,()->service.save(7L,null,request));
    }
    @Test void draftHandoffRejectsWrongTargetChangedMenuAndUnexpectedExtraDishes() {
        PersonalMenuService service=menuService(); Dish d=dish(1); when(dishes.lockReadable(1L,7L)).thenReturn(d); when(menus.selectOwned(3L,7L)).thenReturn(menu(d)); MealContext context=new MealContext(); context.setDate("2026-10-08"); context.setMealType("dinner"); context.setPeople(4);
        assertDoesNotThrow(()->service.validateDraft(7L,3L,2L,"2026-10-08","dinner",context,Arrays.asList(d)));
        assertThrows(IllegalArgumentException.class,()->service.validateDraft(7L,3L,2L,"2026-10-09","dinner",context,Arrays.asList(d)));
        assertThrows(IllegalArgumentException.class,()->service.validateDraft(7L,3L,2L,"2026-10-08","dinner",context,Arrays.asList(d,dish(2))));
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.validateDraft(7L,3L,1L,"2026-10-08","dinner",context,Arrays.asList(d)));
    }
    @Test void privateMutationCannotEditOrDeleteAReadablePublicDish() {
        CustomDishService service=dishService(); Dish publicDish=dish(1); when(dishes.lockReadable(1L,7L)).thenReturn(publicDish);
        DishWriteRequest request=write("public-edit");request.setExpectedVersion(publicDish.getContentVersion());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.updatePersonalDish(7L,1L,request));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.deletePersonalDish(7L,1L,request));
        verify(dishes,never()).update(any());verify(dishes,never()).delete(anyLong(),anyLong());
    }
    @Test void deletionRequiresTheReviewedDishVersionAndPersistsReceipt() {
        CustomDishService service=dishService();Dish current=dish(1);current.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(current);when(dishes.delete(1L,7L)).thenReturn(1);
        DishWriteRequest request=write("delete-one");request.setExpectedVersion("stale");assertThrows(MealConsumptionService.VersionConflict.class,()->service.deletePersonalDish(7L,1L,request));
        request.setExpectedVersion(current.getContentVersion());assertEquals(true,service.deletePersonalDish(7L,1L,request).get("success"));verify(logs).log(eq(7L),eq("delete-one"),anyString(),anyString());
    }
    @Test void menuReceiptDoesNotDuplicateAndChangedIntentCannotReuseItsKey() {
        PersonalMenuService service=menuService();Dish d=dish(1);when(dishes.lockReadable(1L,7L)).thenReturn(d);
        Map<String,Object> receipt=new HashMap<>();when(logs.request(7L,"menu-retry")).thenAnswer(call->receipt.isEmpty()?null:receipt);
        doAnswer(call->{receipt.put("requestHash",call.getArgument(2));receipt.put("responseJson",call.getArgument(3));return 1;}).when(logs).log(eq(7L),eq("menu-retry"),anyString(),anyString());
        doAnswer(call->{((CustomRecipe)call.getArgument(0)).setId(3L);return 1;}).when(menus).insert(any());
        MenuWriteRequest request=new MenuWriteRequest();request.setRequestId("menu-retry");request.setExpectedVersion(0L);request.setName("菜单");request.setPeople(2);request.setDishIds(Arrays.asList(1L));
        assertEquals(3L,service.save(7L,null,request).getId());assertEquals(3L,service.save(7L,null,request).getId());verify(menus,times(1)).insert(any());
        request.setName("another");assertThrows(MealConsumptionService.VersionConflict.class,()->service.save(7L,null,request));
    }
    @Test void menuHttpControllerFailsClosedWithoutAuthenticatedIdentity() {
        com.eatwhat.controller.MenuController controller=new com.eatwhat.controller.MenuController(menuService());
        javax.servlet.http.HttpServletRequest http=mock(javax.servlet.http.HttpServletRequest.class);
        org.springframework.web.server.ResponseStatusException error=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.list(http));
        assertEquals(401,error.getStatus().value());verify(menus,never()).selectByUserId(any());
    }
    @Test void personalSqlUsesOwnerBoundariesAndAllRichFields() throws Exception {
        String read=String.join(" ",PersonalDishMapper.class.getMethod("lockReadable",Long.class,Long.class).getAnnotation(org.apache.ibatis.annotations.Select.class).value());assertTrue(read.contains("owner_id IS NULL"));assertTrue(read.contains("OR owner_id=#{userId}"));assertTrue(read.endsWith("FOR UPDATE"));assertTrue(read.contains("document AS recipeJson"));String update=String.join(" ",PersonalDishMapper.class.getMethod("update",Dish.class).getAnnotation(org.apache.ibatis.annotations.Update.class).value());assertTrue(update.contains("owner_id=#{userId}"));assertTrue(update.contains("document=#{recipeJson}"));String menu=String.join(" ",RecipeMapper.class.getMethod("selectOwned",Long.class,Long.class).getAnnotation(org.apache.ibatis.annotations.Select.class).value());assertTrue(menu.contains("user_id=#{userId} AND is_deleted=0"));
    }

    @Test void nameOnlyEditPreservesRichRecipeAndStepImages() {
        CustomDishService service=dishService();Dish source=dish(1);source.setUserId(7L);source.setCookMinutes(20);
        when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);
        DishWriteRequest request=write("rename-one");request.setExpectedVersion(source.getContentVersion());request.setCl("鱼|1|条");request.setStep("洗鱼#蒸熟");request.setCookMinutes(20);
        Dish updated=service.updatePersonalDish(7L,1L,request);
        assertEquals("我的鱼",updated.getName());assertEquals(source.getCl(),updated.getCl());assertEquals(source.getIngredientsAmounts(),updated.getIngredientsAmounts());
        assertEquals(source.getStep(),updated.getStep());assertEquals(source.getSteps(),updated.getSteps());assertEquals(source.getStepImages(),updated.getStepImages());
    }
    @Test void timeOnlyEditPreservesJsonRichRecipeAndImages() {
        CustomDishService service=dishService();Dish source=dish(1);source.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest request=write("time-one");request.setRecipe(source.getRecipe().deepCopy());request.setExpectedVersion(source.getContentVersion());((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("timing")).put("totalMinutes",30);Dish updated=service.updatePersonalDish(7L,1L,request);assertEquals(30,updated.getCookMinutes());assertEquals(source.getIngredientsAmounts(),updated.getIngredientsAmounts());assertEquals(source.getSteps(),updated.getSteps());assertEquals(source.getStepImages(),updated.getStepImages());
    }

    @Test void editedCookMinutesSynchronizesAndExplicitClearRemovesLegacyTime() {
        CustomDishService service=dishService();Dish source=dish(1);source.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest request=write("time-sync");request.setExpectedVersion(source.getContentVersion());((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("timing")).put("totalMinutes",10);assertEquals("10分钟",service.updatePersonalDish(7L,1L,request).getCookTime());request.setRequestId("time-clear");((com.fasterxml.jackson.databind.node.ObjectNode)request.getRecipe().path("timing")).putNull("totalMinutes");assertNull(service.updatePersonalDish(7L,1L,request).getCookTime());
    }
    @Test void menuDraftRestoresSavedOrderWhenExistingLocksReorderTheSameDishes() {
        PersonalMenuService service=menuService();Dish first=dish(1),second=dish(2);CustomRecipe menu=menu(first);menu.setDishIds(Arrays.asList(1L,2L));menu.setDishes(Arrays.asList(first,second));
        when(menus.selectOwned(3L,7L)).thenReturn(menu);when(dishes.lockReadable(1L,7L)).thenReturn(first);when(dishes.lockReadable(2L,7L)).thenReturn(second);
        MealContext context=new MealContext();context.setDate("2026-10-08");context.setMealType("dinner");context.setPeople(4);
        List<Dish> generated=new ArrayList<>(Arrays.asList(second,first));service.validateDraft(7L,3L,2L,"2026-10-08","dinner",context,generated);
        assertEquals(Arrays.asList(1L,2L),Arrays.asList(generated.get(0).getId(),generated.get(1).getId()));
    }

    @Test void optionalEditsClearOnlyWhenExplicitAndLegacyRequestsPreserveFields() throws Exception {
        Dish source=dish(1);source.setUserId(7L);CanonicalTestCatalog.changed(source,r->r.put("imageUrl","https://example.com/fish.jpg"));catalog.enrich(source);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest keep=write("keep-image");keep.setRecipe(source.getRecipe().deepCopy());keep.setExpectedVersion(source.getContentVersion());assertEquals(source.getImage(),dishService().updatePersonalDish(7L,1L,keep).getImage());DishWriteRequest clear=write("clear-image");clear.setExpectedVersion(source.getContentVersion());recipe(clear).putNull("imageUrl");Dish result=dishService().updatePersonalDish(7L,1L,clear);assertNull(result.getImage());assertEquals("https://example.com/fish.jpg",source.getImage());
    }

    @Test void absentOptionalFlagsDoNotChangeLegacyReceiptEncoding() throws Exception {
        DishWriteRequest request=write("existing-pending");
        String encoded=json.writeValueAsString(request);
        assertFalse(encoded.contains("editServingDescription")); assertFalse(encoded.contains("editImage"));assertFalse(encoded.contains("\"quantityPolicy\":null"));
    }

    @Test void optionalServingEditRevokesVerifiedCopyEvidenceAndKeepsOriginalQuality() {
        Dish source=dish(1);source.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest request=write("serving-edit");request.setExpectedVersion(source.getContentVersion());recipe(request).putNull("baseServings");recipe(request).put("servingBasis","recipe_batch");Dish changed=dishService().updatePersonalDish(7L,1L,request);assertNull(changed.getFl());assertNull(changed.getQuality());assertTrue(changed.getScaledRecipe().path("nutrition").path("perServing").isNull());assertEquals(2,source.getRecipe().path("baseServings").asInt());assertEquals(changed.getScaledRecipe().path("ingredients"),catalog.scale(changed,java.math.BigDecimal.ONE).path("ingredients"));
    }
    @Test void explicitOptionalUpdateSupportsReplacementAndRejectsUnsafeImageScheme() {
        Dish source=dish(1);source.setUserId(7L);when(dishes.lockReadable(1L,7L)).thenReturn(source);when(dishes.update(any())).thenReturn(1);DishWriteRequest request=write("replace-optionals");request.setExpectedVersion(source.getContentVersion());recipe(request).put("baseServings",4);recipe(request).put("imageUrl","https://example.com/new.jpg");Dish changed=dishService().updatePersonalDish(7L,1L,request);assertEquals("4",changed.getFl());assertEquals("https://example.com/new.jpg",changed.getImage());request.setRequestId("unsafe-image");recipe(request).put("imageUrl","javascript:alert(1)");assertThrows(IllegalArgumentException.class,()->dishService().updatePersonalDish(7L,1L,request));
    }

}
