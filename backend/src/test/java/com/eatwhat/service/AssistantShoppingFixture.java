package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantActionContract.*;
import com.eatwhat.dto.AssistantShoppingContract.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import static org.mockito.Mockito.*;

/** Real preview/parser/list/alias/harness/runner services with persistence-only substitutes. */
class AssistantShoppingFixture {
 final AssistantCalendarActionTest.Fixture f=new AssistantCalendarActionTest.Fixture();
 final ShoppingScopeAliasMapper aliases=mock(ShoppingScopeAliasMapper.class);final Map<String,String> aliasRows=new HashMap<>();
 final ShoppingListMapper listDb=mock(ShoppingListMapper.class);final ShoppingDishMapper groupsDb=mock(ShoppingDishMapper.class);final ShoppingItemMapper itemsDb=mock(ShoppingItemMapper.class);final ShoppingRequestLogMapper logs=mock(ShoppingRequestLogMapper.class);
 final ShoppingList list=new ShoppingList();final List<ShoppingDish> groups=new ArrayList<>();final List<ShoppingItem> items=new ArrayList<>();final Map<String,ShoppingRequestLog> receipts=new HashMap<>();
 final ShoppingPreviewService previews;final ShoppingListService lists;
 final CanonicalCatalogService catalog=CanonicalTestCatalog.service();
 ShoppingProcurementScopeService scopes;ShoppingAssistantToolAdapter adapter;AssistantV4TurnService turns;
 final AssistantV4ModelGateway model=mock(AssistantV4ModelGateway.class);long sequence=10;
 AssistantShoppingFixture() throws Exception {
  Dish recipe=f.domain.reviewed.get(0);com.fasterxml.jackson.databind.node.ObjectNode canonical=CanonicalTestCatalog.recipe(recipe.getId(),recipe.getName(),"green",new java.math.BigDecimal("200"),new java.math.BigDecimal("2"));CanonicalTestCatalog.line((com.fasterxml.jackson.databind.node.ArrayNode)canonical.path("ingredients"),"i2","salt",new java.math.BigDecimal("2"));recipe.setRecipe(canonical);catalog.enrich(recipe);refreshDraft();
  when(aliases.find(anyLong(),anyString())).thenAnswer(i->aliasRows.get(i.getArgument(0)+"|"+i.getArgument(1)));workingAliases();
  when(aliases.lockDishes(eq(1L),anyList())).thenAnswer(i->{List<Dish> out=new ArrayList<>();for(Dish dish:f.domain.reviewed)out.add(CanonicalTestCatalog.cloneDish(dish));return out;});

  list.setId(1L);list.setUserId(1L);list.setVersion(0L);list.setMetadataVersion(1);when(listDb.findByUserId(1L)).thenReturn(list);when(listDb.findByUserIdForUpdate(1L)).thenReturn(list);
  when(listDb.updateVersion(eq(1L),eq(1L),anyLong(),anyInt())).thenAnswer(i->{list.setVersion(i.getArgument(2));return 1;});
  when(groupsDb.findByListId(1L)).thenAnswer(i->new ArrayList<>(groups));when(groupsDb.findBySelectionKey(eq(1L),anyString())).thenAnswer(i->groups.stream().filter(g->g.getSelectionKey().equals(i.getArgument(1))).findFirst().orElse(null));
  when(groupsDb.insert(any())).thenAnswer(i->{ShoppingDish g=i.getArgument(0);g.setId(sequence++);groups.add(g);return 1;});
  when(itemsDb.findByListId(1L,"all")).thenAnswer(i->new ArrayList<>(items));when(itemsDb.findBySource(anyLong(),anyInt())).thenAnswer(i->items.stream().filter(v->v.getShoppingDishId().equals(i.getArgument(0))&&v.getSourceLineNo().equals(i.getArgument(1))).findFirst().orElse(null));
  when(itemsDb.insert(any())).thenAnswer(i->{ShoppingItem item=i.getArgument(0);item.setId(sequence++);items.add(item);return 1;});
  when(itemsDb.update(any(),eq(1L))).thenAnswer(i->{ShoppingItem item=i.getArgument(0);items.removeIf(v->v.getId().equals(item.getId()));items.add(item);return 1;});when(itemsDb.delete(anyLong(),eq(1L))).thenAnswer(i->{items.removeIf(v->v.getId().equals(i.getArgument(0)));return 1;});
  when(logs.findSuccess(eq(1L),anyString())).thenAnswer(i->receipts.get(i.getArgument(1)));when(logs.insertBoundSuccess(eq(1L),anyString(),anyString(),anyString())).thenAnswer(i->{ShoppingRequestLog r=new ShoppingRequestLog();r.setRequestHash(i.getArgument(2));r.setResponseJson(i.getArgument(3));receipts.put(i.getArgument(1),r);return 1;});
  previews=CanonicalTestCatalog.wire(new ShoppingPreviewService(f.domain.dishes,new IngredientParserService(),new IngredientNormalizationService()),catalog);lists=spy(new ShoppingListService(listDb,groupsDb,itemsDb,logs,mock(ShoppingListMergeService.class),previews,f.domain.json));initialize();
 }
 void workingAliases(){doAnswer(i->{aliasRows.putIfAbsent(i.getArgument(0)+"|"+i.getArgument(1),i.getArgument(2));return 1;}).when(aliases).insert(anyLong(),anyString(),anyString());}
 void refreshDraft() throws Exception {MealWorkspace w=f.domain.service.get(1L,"source");w.getDraft().setDishes(f.domain.reviewed);f.domain.sourceJson=f.domain.json.writeValueAsString(w);}
 void initialize(){
  scopes=new ShoppingProcurementScopeService(aliases,f.persistence.locks,f.domain.service,f.domain.plans,f.domain.dishes,f.harness,f.persistence.tx,f.domain.json);AssistantCapabilityService registry=new AssistantCapabilityService(true);
  adapter=new ShoppingAssistantToolAdapter(scopes,previews,lists,f.harness,f.persistence.store,registry,f.runner,f.persistence.tx,f.domain.json);registry.registerRead("read_current_meal",(u,c,s)->new ReadResult());
  turns=new AssistantV4TurnService(f.persistence.store,mock(AssistantV4ContextService.class),registry,model,mock(AiProtectionService.class),f.domain.dishes,f.domain.json,Clock.fixed(Instant.ofEpochMilli(f.persistence.now),ZoneOffset.UTC),Runnable::run);
  when(f.runner.getIfAvailable()).thenReturn(turns);when(f.listeners.orderedStream()).thenAnswer(i->Stream.of(scopes));
 }
 ShoppingIntent draft(){ShoppingIntent i=new ShoppingIntent();ShoppingSourceRef r=new ShoppingSourceRef();r.setKind("draft");r.setWorkspaceId("source");i.setSourceRef(r);return i;}
 ShoppingIntent plan(String date,String meal){ShoppingIntent i=new ShoppingIntent();ShoppingSourceRef r=new ShoppingSourceRef();r.setKind("plan");r.setDate(date);r.setMealType(meal);i.setSourceRef(r);return i;}
 ControlledToolTask preview(){return adapter.prepareShopping(1L,draft(),UUID.randomUUID().toString());}
 ControlledToolTask confirm(ControlledToolTask t){return f.harness.confirm(1L,t.id,t.previewToken);}
 ControlledToolTask calendar(String date,String meal){CalendarSaveIntent i=new CalendarSaveIntent();i.setSourceWorkspaceId("source");i.setTargetDate(date);i.setTargetMealType(meal);return f.adapter.prepareCalendar(1L,i,UUID.randomUUID().toString());}
 ControlledToolTask workflow(boolean save){
  SessionRequest session=new SessionRequest();session.setWorkspaceId("source");session.setRequestId(UUID.randomUUID().toString());f.sessionId=f.persistence.store.createSession(1L,session).getSessionId();TurnRequest request=f.persistence.request();request.setWorkspaceId("source");request.setExpectedWorkspaceRevision(4L);request.setExpectedPlanVersion(3L);f.turnId=f.persistence.store.claimTurn(1L,f.sessionId,request).getTurnId();f.lease=f.persistence.store.acquireTurn(1L,f.turnId);
  List<ActionIntent> actions=new ArrayList<>();if(save){ActionIntent a=new ActionIntent();a.setKind("calendar_save");a.getArguments().put("targetDate","2026-12-31");a.getArguments().put("targetMealType","dinner");actions.add(a);}ActionIntent shopping=new ActionIntent();shopping.setKind("shopping_preview");shopping.setArguments(f.domain.json.convertValue(draft(),Map.class));actions.add(shopping);f.workflow=AssistantV4Contract.workflow(f.turnId,actions);f.persistence.store.checkpointContinuation(1L,f.turnId,f.lease.getLeaseToken(),f.workflow);
  f.scope=new TurnScope();f.scope.setUserId(1L);f.scope.setTurnId(f.turnId);f.scope.setSessionId(f.sessionId);f.scope.setWorkspaceId("source");f.scope.setExpectedWorkspaceRevision(4L);f.scope.setExpectedPlanVersion(3L);WorkflowStep step=f.workflow.getSteps().get(0);TurnResult result=save?f.adapter.execute(1L,step,f.scope):adapter.execute(1L,step,f.scope);step.setStatus("awaiting_confirmation");step.setTaskId(result.getPendingAction().getTaskId());result.setContinuation(f.workflow);f.persistence.store.completeTurn(1L,f.turnId,"running",f.lease.getLeaseToken(),result);return f.harness.get(1L,result.getPendingAction().getTaskId());
 }
 List<Map<String,Object>> rows(ControlledToolTask t){return (List<Map<String,Object>>)t.steps.get(0).binding.get("items");}
 RepreviewRequest choose(ControlledToolTask t){RepreviewRequest r=new RepreviewRequest();r.setRequestId(UUID.randomUUID().toString());r.setSelectedSourceKeys(Collections.singletonList((String)rows(t).get(0).get("sourceKey")));return r;}
}
