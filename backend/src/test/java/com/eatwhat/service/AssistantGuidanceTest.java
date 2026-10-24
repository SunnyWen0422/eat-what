package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import com.eatwhat.dto.AssistantV4Contract;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AssistantGuidanceTest {
    final ObjectMapper json=new ObjectMapper();
    MealWorkspace workspace(){MealWorkspace w=new MealWorkspace();w.setId("w");MealContext c=new MealContext();c.setDate("2026-10-15");c.setMealType("dinner");w.setContext(c);return w;}
    TurnScope scope(){TurnScope s=new TurnScope();s.setUserId(7L);s.setWorkspaceId("w");s.setExpectedWorkspaceRevision(0L);s.setExpectedPlanVersion(0L);return s;}
    ToolRead call(String name,Map<String,Object> args){ToolRead c=new ToolRead();c.setCallId("c");c.setName(name);c.setArguments(args);return c;}
    @Test void favoritesAreReadOnlyPagedAndOwnerScoped(){
        MealWorkspaceService workspaces=mock(MealWorkspaceService.class);when(workspaces.get(7L,"w")).thenReturn(workspace());
        FavoriteDishService favorites=mock(FavoriteDishService.class);when(favorites.getFavoriteDishIds(7L)).thenReturn(Arrays.asList(3L,1L,2L));
        DishQueryService dishes=mock(DishQueryService.class);when(dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(call->{List<Dish> rows=new ArrayList<>();for(Long id:(List<Long>)call.getArgument(0)){Dish d=new Dish();d.setId(id);d.setName("菜"+id);d.setType("veg");rows.add(CanonicalTestDish.attach(d));}return rows;});
        PersonalMenuService menus=mock(PersonalMenuService.class);
        AssistantPersonalReadService reads=new AssistantPersonalReadService(workspaces,favorites,menus,dishes,mock(RecommendationMetadataService.class),json,new AssistantCapabilityService(true));
        ReadResult page=reads.read(7L,call("read_favorites",Collections.singletonMap("limit",2)),scope());
        assertEquals(2,page.getItems().size());assertEquals("2",page.getNextCursor());assertEquals(1L,page.getItems().get(0).get("id"));
        assertThrows(IllegalArgumentException.class,()->reads.read(8L,call("read_favorites",Collections.emptyMap()),scope()));
        verifyNoInteractions(menus);
    }
    @Test void menuSearchDoesNotConfuseSameNamesOrExposeOtherOwners(){
        MealWorkspaceService workspaces=mock(MealWorkspaceService.class);when(workspaces.get(7L,"w")).thenReturn(workspace());
        PersonalMenuService menus=mock(PersonalMenuService.class);List<CustomRecipe> source=new ArrayList<>();
        for(long id:Arrays.asList(1L,2L)){CustomRecipe m=new CustomRecipe();m.setId(id);m.setUserId(7L);m.setName("家常");m.setVersion(id);m.setDishIds(Collections.singletonList(10L));source.add(m);}
        when(menus.list(7L)).thenReturn(source);
        AssistantPersonalReadService reads=new AssistantPersonalReadService(workspaces,mock(FavoriteDishService.class),menus,mock(DishQueryService.class),mock(RecommendationMetadataService.class),json,new AssistantCapabilityService(true));
        ReadResult result=reads.read(7L,call("read_saved_menus",Collections.singletonMap("query","家常")),scope());
        assertEquals(2,result.getItems().size());assertNotEquals(result.getItems().get(0).get("id"),result.getItems().get(1).get("id"));
        source.get(0).setUserId(8L);
        assertThrows(IllegalArgumentException.class,()->reads.read(7L,call("read_saved_menus",Collections.emptyMap()),scope()));
    }
    @Test void serverCreatesBoundedDateChoicesWithoutSelectingForTheUser(){
        AssistantGuidanceService service=new AssistantGuidanceService(mock(MealWorkspaceService.class),mock(AssistantV4Store.class),json,new AssistantCapabilityService(true),Clock.fixed(Instant.parse("2026-10-15T12:00:00Z"),ZoneOffset.UTC));
        Card card=service.createClarification("parent",workspace(),"请说明目标日期。");
        assertEquals("clarification",card.getType());assertEquals("parent",card.getData().get("continuationRef"));
        assertEquals(3,((List<?>)card.getData().get("authorizedOptions")).size());
        assertEquals(600000L,card.getExpiresAt()-Instant.parse("2026-10-15T12:00:00Z").toEpochMilli());
        assertNull(card.getTaskId());assertNull(card.getPreviewToken());
        assertNull(service.createClarification("parent",workspace(),"请说明要查询或调整的菜品、餐次。"));
    }
    final long now=Instant.parse("2026-10-15T12:00:00Z").toEpochMilli();
    TurnRequest choice(String option){
        TurnRequest request=new TurnRequest();request.setRequestId(UUID.randomUUID().toString());request.setWorkspaceId("w");request.setMessage("选择日期");request.setEntryScene("chat");request.setExpectedWorkspaceRevision(0L);request.setExpectedPlanVersion(0L);request.setUiFeatures(Collections.singletonList("clarification_v1"));
        ClarificationChoice c=new ClarificationChoice();c.setContinuationRef("parent");c.setOptionId(option);request.setClarificationChoice(c);return request;
    }
    TurnRecord parent(TurnRequest request,boolean consumed)throws Exception{
        AssistantGuidanceService service=new AssistantGuidanceService(mock(MealWorkspaceService.class),mock(AssistantV4Store.class),json,new AssistantCapabilityService(true),Clock.fixed(Instant.ofEpochMilli(now),ZoneOffset.UTC));
        Card card=service.createClarification("parent",workspace(),"请说明目标日期。");
        if(consumed)card.getData().put("consumedByRequestId",request.getRequestId());
        TurnResult result=new TurnResult();result.getCards().add(card);
        TurnRecord row=new TurnRecord();row.setId("parent");row.setUserId(7L);row.setSessionId("s");row.setWorkspaceId("w");row.setStatus("needs_input");row.setResultJson(json.writeValueAsString(result));
        TurnRequest original=choice("tomorrow");original.setMessage("保存到下一次，日期待选");row.setInputJson(json.writeValueAsString(original));return row;
    }
    @Test void choicesUseOnlyOriginalServerFactsAndRetainOriginalIntent()throws Exception{
        TurnRequest r=choice("tomorrow");Map<String,Object> result=AssistantGuidanceService.validateChoice(7L,"s",r,parent(r,false),workspace(),json,now,false);
        assertEquals("保存到下一次，日期待选",result.get("originalIntent"));assertEquals("2026-10-16",((Map<?,?>)result.get("selection")).get("date"));
        assertFalse(result.containsKey("taskId"));assertFalse(result.containsKey("previewToken"));
        assertNotNull(AssistantV4Contract.parseTurn(json.valueToTree(r)).getClarificationChoice());
    }
    @Test void repeatedClarificationRetainsTheRootTaskRatherThanOnlyTheLastAnswer()throws Exception{
        TurnRequest r=choice("tomorrow");TurnRecord row=parent(r,false);TurnResult result=json.readValue(row.getResultJson(),TurnResult.class);
        result.getCards().get(0).getData().put("originalIntent","安排一餐并保存到我选择的日历");result.getCards().get(0).getData().put("priorSelection",Collections.singletonMap("mealType","lunch"));row.setResultJson(json.writeValueAsString(result));
        Map<String,Object> validated=AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,false);
        assertEquals("安排一餐并保存到我选择的日历",validated.get("originalIntent"));assertEquals("lunch",((Map<?,?>)validated.get("selection")).get("mealType"));assertEquals("2026-10-16",((Map<?,?>)validated.get("selection")).get("date"));
    }
    @Test void expiredStaleForeignAndUnknownChoicesAreRejected()throws Exception{
        TurnRequest r=choice("tomorrow");TurnRecord row=parent(r,false);
        assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now+600000,false));
        assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(8L,"s",r,row,workspace(),json,now,false));
        assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"other",r,row,workspace(),json,now,false));
        MealWorkspace changed=workspace();changed.setRevision(1L);
        assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,changed,json,now,false));
        r.getClarificationChoice().setOptionId("made-up");assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,false));
        r.getClarificationChoice().setOptionId("tomorrow");r.getClarificationChoice().setDate("2026-10-17");assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,false));
    }
    @Test void reservedChoiceAcceptsOnlyTheOriginalRequestAndDatePickerHasStrictInput()throws Exception{
        TurnRequest r=choice("date");r.getClarificationChoice().setDate("2026-10-20");TurnRecord row=parent(r,true);
        assertEquals("2026-10-20",((Map<?,?>)AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,true).get("selection")).get("date"));
        assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,false));
        r.setRequestId(UUID.randomUUID().toString());assertThrows(ResponseStatusException.class,()->AssistantGuidanceService.validateChoice(7L,"s",r,row,workspace(),json,now,true));
        r.setUiFeatures(null);assertThrows(IllegalArgumentException.class,()->AssistantV4Contract.parseTurn(json.valueToTree(r)));
    }
    @Test void extendedReadsAreNotExposedBeforePairedServiceNegotiation(){
        AssistantCapabilityService registry=new AssistantCapabilityService(true);registry.registerTurnExecutor((u,t)->{});
        registry.registerRead("read_current_meal",(u,c,s)->new ReadResult());registry.registerRead("read_favorites",(u,c,s)->new ReadResult());
        assertFalse(registry.capabilities().getReads().contains("read_favorites"));assertThrows(IllegalArgumentException.class,()->registry.readExecutor("read_favorites"));
        registry.configureExtensions(true,()->true);assertTrue(registry.capabilities().getReads().contains("read_favorites"));
        registry.configureExtensions(true,()->false);assertFalse(registry.capabilities().getReads().contains("read_favorites"));
    }
    @Test void optionCodesComeFromExistingDictionaryAndEmptyFavoritesStayEmpty(){
        MealWorkspaceService w=mock(MealWorkspaceService.class);when(w.get(7L,"w")).thenReturn(workspace());
        RecommendationMetadataService metadata=mock(RecommendationMetadataService.class);RecommendationOptionsDTO options=new RecommendationOptionsDTO();
        RecommendationOptionsDTO.Option o=new RecommendationOptionsDTO.Option();o.setCode("LIGHT");o.setLabel("清淡");o.setKind("tag");options.getGroups().put("flavor",Collections.singletonList(o));when(metadata.getOptions()).thenReturn(options);
        AssistantPersonalReadService reads=new AssistantPersonalReadService(w,mock(FavoriteDishService.class),mock(PersonalMenuService.class),mock(DishQueryService.class),metadata,json,new AssistantCapabilityService(true));
        assertEquals("LIGHT",reads.read(7L,call("get_recommendation_options",Collections.singletonMap("group","flavor")),scope()).getItems().get(0).get("code"));
        assertThrows(IllegalArgumentException.class,()->reads.read(7L,call("get_recommendation_options",Collections.singletonMap("group","invented")),scope()));
        assertTrue(reads.read(7L,call("read_favorites",Collections.emptyMap()),scope()).getItems().isEmpty());
    }
    @Test void navigationUsesOwnedCurrentReferencesAndNeverWritesBusinessData(){
        MealWorkspaceService w=mock(MealWorkspaceService.class);when(w.get(7L,"w")).thenReturn(workspace());
        DishQueryService d=mock(DishQueryService.class);Dish dish=new Dish();dish.setId(9L);dish.setName("青菜");when(d.getDishesByIdsForUser(Collections.singletonList(9L),7L)).thenReturn(Collections.singletonList(dish));
        PersonalMenuService m=mock(PersonalMenuService.class);CustomRecipe menu=new CustomRecipe();menu.setId(3L);menu.setUserId(7L);menu.setVersion(5L);when(m.get(7L,3L)).thenReturn(menu);
        FavoriteDishService f=mock(FavoriteDishService.class);when(f.getFavoriteDishIds(7L)).thenReturn(Collections.singletonList(9L));
        ShoppingListService sh=mock(ShoppingListService.class);ShoppingListResponse list=new ShoppingListResponse();list.setVersion(8L);ShoppingDishDTO group=new ShoppingDishDTO();ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();item.setId(4L);group.getItems().add(item);list.getDishes().add(group);when(sh.getList(7L,"all")).thenReturn(list);
        MealConsumptionService actual=mock(MealConsumptionService.class);UserPreferenceService p=mock(UserPreferenceService.class);
        AssistantGuidanceService service=new AssistantGuidanceService(w,mock(AssistantV4Store.class),json,new AssistantCapabilityService(true),Clock.fixed(Instant.ofEpochMilli(now),ZoneOffset.UTC));service.setupNavigation(d,m,f,sh,actual,p);
        TurnScope scope=scope();scope.setTurnId("t");scope.getAuthorizedDishIds().add(9L);
        Map<String,Object> intent=AssistantV4ContextService.map("kind","copy_recipe","ref",Collections.singletonMap("dishId",9L),"userText","伪造的克数");
        Card card=service.resolveNavigation(7L,intent,scope,"少油一点");assertEquals("handoff",card.getType());assertNull(card.getReceiptRef());assertNull(card.getTaskId());assertEquals(dish.getContentVersion(),card.getData().get("sourceVersion"));assertEquals("少油一点",((Map<?,?>)card.getData().get("prefill")).get("userText"));
        intent.put("url","https://evil.test");assertThrows(IllegalArgumentException.class,()->service.resolveNavigation(7L,intent,scope,"原句"));intent.remove("url");
        scope.getAuthorizedDishIds().clear();assertThrows(IllegalArgumentException.class,()->service.resolveNavigation(7L,intent,scope,"原句"));
        Card shopping=service.resolveNavigation(7L,AssistantV4ContextService.map("kind","edit_shopping","ref",Collections.singletonMap("itemId",4L)),scope,"改采购");assertEquals("8",shopping.getData().get("sourceVersion"));
        assertThrows(IllegalArgumentException.class,()->service.resolveNavigation(7L,AssistantV4ContextService.map("kind","edit_shopping","ref",Collections.singletonMap("itemId",5L)),scope,"改采购"));
        Card choice=service.resolveNavigation(7L,AssistantV4ContextService.map("kind","record_actual","ref",Collections.emptyMap()),scope,"记录晚餐");assertEquals("clarification",choice.getType());verifyNoInteractions(actual);
        Card use=service.resolveNavigation(7L,AssistantV4ContextService.map("kind","use_personal_menu","ref",Collections.singletonMap("menuId",3L),"target",AssistantV4ContextService.map("date","2026-10-16","mealType","lunch")),scope,"用菜单");assertEquals("5",use.getData().get("sourceVersion"));
        menu.setUserId(8L);assertThrows(IllegalArgumentException.class,()->service.resolveNavigation(7L,AssistantV4ContextService.map("kind","use_personal_menu","ref",Collections.singletonMap("menuId",3L),"target",AssistantV4ContextService.map("date","2026-10-16","mealType","lunch")),scope,"用菜单"));
        verify(w,never()).mutate(anyLong(),anyString(),anyString(),any());verify(m,never()).save(anyLong(),any(),any());verifyNoInteractions(p);
    }
}
