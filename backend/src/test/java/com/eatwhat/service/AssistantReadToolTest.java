package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantReadToolTest {
    static RecipeRecord saved(String date,String name) {
        RecipeRecord record=new RecipeRecord();record.setUserId(7L);record.setMealType("dinner");record.setRecordDateString(date);record.setRecipeName(name);
        Dish dish=Fixture.dish(5,name);dish.setType("veg");record.setDishDetails(Arrays.asList(dish));return record;
    }
    @Test void record_summary_uses_same_past_calendar_rows_as_display() {
        Fixture f=new Fixture();RecipeRecord past=saved("2020-01-01","青菜"),future=saved("2099-01-01","明天的菜");
        when(f.meals.overview(anyLong(),anyString(),anyString())).thenAnswer(i->{String day=i.getArgument(1);return Collections.singletonMap("plans",Arrays.asList(day.equals("2020-01-01")?past:future));});
        AssistantReadToolService service=f.reads();ReadResult result=service.read(7L,f.call("read_actual_diet_review","startDate","2099-01-01","endDate","2099-01-01"),f.scope);assertEquals(0,((Map<?,?>)result.getItems().get(0).get("summary")).get("mealCount"));
        result=service.read(7L,f.call("read_actual_diet_review","startDate","2020-01-01","endDate","2020-01-01"),f.scope);assertEquals(1,((Map<?,?>)result.getItems().get(0).get("summary")).get("mealCount"));assertEquals(1,((Map<?,?>)result.getItems().get(0).get("summary")).get("classifiedCount"));verify(f.meals,never()).review(anyLong(),anyString(),anyString());
    }
    static class Fixture extends AssistantV4ContextTest.Fixture {
        final DishQueryService dishes=mock(DishQueryService.class);final DishCandidateQueryService candidates=mock(DishCandidateQueryService.class);
        final MealConsumptionService meals=mock(MealConsumptionService.class);final ShoppingListService shopping=mock(ShoppingListService.class);
        final AssistantCapabilityService capabilities=new AssistantCapabilityService(true);final TurnScope scope=new TurnScope();
        Fixture(){scope.setUserId(7L);scope.setWorkspaceId(w.getId());scope.setExpectedWorkspaceRevision(8L);scope.setExpectedPlanVersion(4L);when(dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(i->{List<Dish> out=new ArrayList<>();for(Long id:(List<Long>)i.getArgument(0))out.add(dish(id,"菜"+id));return out;});when(meals.overview(anyLong(),anyString(),anyString())).thenReturn(new LinkedHashMap<>());}
        static Dish dish(long id,String name){return CanonicalAssistantFixture.enrich(AssistantV4ContextTest.Fixture.dish(id,name));}
        AssistantReadToolService reads(){return new AssistantReadToolService(workspaces,dishes,candidates,preferences,metadata,meals,shopping,json,capabilities);}
        ToolRead call(String name,Object... args){ToolRead r=new ToolRead();r.setCallId("call-1");r.setName(name);for(int i=0;i<args.length;i+=2)r.getArguments().put((String)args[i],args[i+1]);return r;}
    }
    @Test void foreign_private_recipe_rejected(){Fixture f=new Fixture();Dish foreign=Fixture.dish(400,"秘密菜");foreign.setUserId(99L);when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Arrays.asList(foreign));assertThrows(IllegalArgumentException.class,()->f.reads().read(7L,f.call("get_dish_details","dish_ids",Arrays.asList(400L)),f.scope));}
    @Test void reference_outside_first_200_is_authorized_on_demand_and_order_kept(){Fixture f=new Fixture();ReadResult r=f.reads().read(7L,f.call("get_dish_details","dish_ids",Arrays.asList(999L,205L)),f.scope);assertEquals(999L,r.getItems().get(0).get("id"));assertEquals(205L,r.getItems().get(1).get("id"));assertTrue(f.scope.getAuthorizedDishIds().contains(999L));verifyNoInteractions(f.candidates);}
    @Test void real_methods_use_canonical_quantity_and_steps(){Fixture f=new Fixture();Dish d=Fixture.dish(999,"菜");d.setSteps("旧步骤");when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenReturn(Arrays.asList(d));ReadResult r=f.reads().read(7L,f.call("get_dish_methods","dish_id",999L),f.scope);assertEquals("METHOD_STIR_FRY",r.getItems().get(0).get("methods"));assertEquals("炒熟",r.getItems().get(0).get("steps"));assertEquals("canonical-fixture-2",r.getItems().get(0).get("catalogRevision"));}
    @Test void hard_exclusions_cannot_be_widened_by_model(){Fixture f=new Fixture();Dish d=Fixture.dish(3,"花生菜");d.setCl("花生");((com.fasterxml.jackson.databind.node.ObjectNode)d.getRecipe().path("ingredients").get(0).path("ingredient")).put("name","花生");when(f.candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenReturn(Arrays.asList(d));assertTrue(f.reads().read(7L,f.call("search_dishes","filters",new LinkedHashMap<>()),f.scope).getItems().isEmpty());}
    @Test void category_coverage_and_paging(){Fixture f=new Fixture();List<Dish> source=new ArrayList<>();for(int i=1;i<=31;i++){Dish d=Fixture.dish(i,"菜"+i);d.setType("soup");source.add(d);}when(f.candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenReturn(source);when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(i->{List<Long> ids=i.getArgument(0);List<Dish> out=new ArrayList<>();for(Dish d:source)if(ids.contains(d.getId()))out.add(d);return out;});ReadResult r=f.reads().read(7L,f.call("search_dishes","filters",Collections.singletonMap("type","soup"),"top_k",30),f.scope);assertTrue(r.getItems().size()>0&&r.getItems().size()<=30);assertTrue(r.isTruncated());assertEquals(String.valueOf(r.getItems().size()),r.getNextCursor().split("\\.")[1]);assertEquals("soup",r.getItems().get(0).get("type"));}
    @Test void current_meal_version_conflict_and_identity_injection_rejected(){Fixture f=new Fixture();AssistantReadToolService s=f.reads();f.w.getDraft().setPlanVersion(5L);assertThrows(MealConsumptionService.VersionConflict.class,()->s.read(7L,f.call("read_current_meal"),f.scope));f.w.getDraft().setPlanVersion(4L);assertThrows(IllegalArgumentException.class,()->s.read(7L,f.call("read_current_meal","userId",99L),f.scope));f.scope.setUserId(99L);assertThrows(IllegalArgumentException.class,()->s.read(7L,f.call("read_current_meal"),f.scope));}
    @Test void calendar_window_pages_at_seven_days(){Fixture f=new Fixture();ReadResult r=f.reads().read(7L,f.call("read_calendar","startDate","2026-10-01","endDate","2026-10-20"),f.scope);assertEquals(7,r.getItems().size());assertEquals("2026-10-08",r.getNextCursor());verify(f.meals).overview(7L,"2026-10-01","2026-10-07");assertThrows(IllegalArgumentException.class,()->f.reads().read(7L,f.call("read_calendar","startDate","2025-01-01","endDate","2026-10-20"),f.scope));}
    @Test void shopping_defaults_to_pending_and_preserves_missing_quantity(){Fixture f=new Fixture();ShoppingListResponse list=new ShoppingListResponse();list.setVersion(12L);ShoppingDishDTO d=new ShoppingDishDTO();ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();item.setDisplayName("青菜");item.setCalculationStatus("UNKNOWN");d.getItems().add(item);list.getDishes().add(d);when(f.shopping.getList(7L,"pending")).thenReturn(list);ReadResult r=f.reads().read(7L,f.call("read_shopping"),f.scope);assertNull(r.getItems().get(0).get("quantityValue"));assertEquals("12",r.getSourceVersion());}
    @Test void review_reads_only_calendar_record_snapshots_and_not_retired_or_private_fields() {
        Fixture f=new Fixture();RecipeRecord record=saved("2026-10-01","记录里的青菜");
        MealConsumption retired=new MealConsumption();retired.setStatus("eaten");retired.setMealDate("2026-10-01");retired.setActualDishesJson("[{\"name\":\"旧状态secret\",\"owner\":99}]");
        when(f.meals.overview(anyLong(),anyString(),anyString())).thenReturn(AssistantV4ContextService.map("plans",Arrays.asList(record),"consumptions",Arrays.asList(retired)));
        ReadResult r=f.reads().read(7L,f.call("read_actual_diet_review","startDate","2026-10-01","endDate","2026-10-01"),f.scope);
        String encoded=f.json.valueToTree(r).toString();assertTrue(encoded.contains("记录里的青菜"));assertFalse(encoded.contains("secret"));assertFalse(encoded.contains("owner"));
    }
    @Test void mixed_category_search_exposes_late_soup_and_preserves_lock(){Fixture f=new Fixture();List<Dish> source=new ArrayList<>();for(int i=1;i<=40;i++)source.add(Fixture.dish(i,"菜"+i));Dish soup=Fixture.dish(999,"汤");soup.setType("soup");source.add(soup);when(f.candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenReturn(source);when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(i->{List<Long> ids=i.getArgument(0);List<Dish> out=new ArrayList<>();for(Dish d:source)if(ids.contains(d.getId()))out.add(d);return out;});ReadResult r=f.reads().read(7L,f.call("search_dishes","top_k",5),f.scope);assertEquals(2L,r.getItems().get(0).get("id"));assertTrue(r.getItems().stream().anyMatch(x->Objects.equals(999L,x.get("id"))));}
    @Test void shopping_preserves_explicit_numeric_and_text_overrides_with_provenance(){Fixture f=new Fixture();ShoppingListResponse list=new ShoppingListResponse();ShoppingDishDTO group=new ShoppingDishDTO();ShoppingPreviewItemDTO numeric=new ShoppingPreviewItemDTO();numeric.setDisplayName("青菜");numeric.setUserOverride(true);numeric.setCalculationStatus("USER_OVERRIDE");numeric.setQuantityValue(new BigDecimal("500"));numeric.setQuantityText("500克");numeric.setUnitCode("g");ShoppingPreviewItemDTO text=new ShoppingPreviewItemDTO();text.setUserOverride(true);text.setCalculationStatus("USER_OVERRIDE");text.setQuantityText("买两把");ShoppingPreviewItemDTO unknown=new ShoppingPreviewItemDTO();unknown.setCalculationStatus("NEEDS_ADJUSTMENT");unknown.setQuantityValue(new BigDecimal("999"));ShoppingPreviewItemDTO calculated=new ShoppingPreviewItemDTO();calculated.setCalculationStatus("CALCULATED");calculated.setParseStatus("PARSED");calculated.setServingsVerified(true);calculated.setQuantityValue(new BigDecimal("250"));group.getItems().addAll(Arrays.asList(numeric,text,unknown,calculated));list.getDishes().add(group);when(f.shopping.getList(7L,"pending")).thenReturn(list);List<Map<String,Object>> items=f.reads().read(7L,f.call("read_shopping"),f.scope).getItems();assertEquals(new BigDecimal("500"),items.get(0).get("quantityValue"));assertEquals("500克",items.get(0).get("quantityText"));assertEquals(true,items.get(0).get("userOverride"));assertEquals("user_override",items.get(0).get("quantityProvenance"));assertNull(items.get(1).get("quantityValue"));assertEquals("买两把",items.get(1).get("quantityText"));assertEquals("user_override",items.get(1).get("quantityProvenance"));assertNull(items.get(2).get("quantityValue"));assertEquals("unknown",items.get(2).get("quantityProvenance"));assertEquals(new BigDecimal("250"),items.get(3).get("quantityValue"));assertEquals("canonical_calculation",items.get(3).get("quantityProvenance"));assertFalse(f.json.valueToTree(items).toString().contains("price"));}
    @Test void include_tags_are_or_within_meal_and_extra_groups_but_both_groups_must_match() {
        Fixture f=new Fixture();f.w.getContext().getCriteria().setIncludeTagCodes(Arrays.asList("LIGHT","HOME_STYLE"));
        f.w.getContext().getCriteria().setExcludeTagCodes(Collections.singletonList("SPICY"));
        Dish both=Fixture.dish(101,"两组各命中一个");both.setTagCodes("LIGHT,QUICK");both.setSteps("炒熟");
        Dish mealOnly=Fixture.dish(102,"仅本餐");mealOnly.setTagCodes("HOME_STYLE");
        Dish extraOnly=Fixture.dish(103,"仅追加");extraOnly.setTagCodes("LOW_EFFORT");
        Dish excluded=Fixture.dish(104,"命中排除");excluded.setTagCodes("LIGHT,QUICK,SPICY");
        List<Dish> pool=Arrays.asList(both,mealOnly,extraOnly,excluded);
        when(f.candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenReturn(pool);
        when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(i->{List<Long> ids=i.getArgument(0);List<Dish> out=new ArrayList<>();for(Dish d:pool)if(ids.contains(d.getId()))out.add(d);return out;});
        AssistantReadToolService service=f.reads();
        ReadResult found=service.read(7L,f.call("search_dishes","filters",Collections.singletonMap("include_tag_codes",Arrays.asList("QUICK","LOW_EFFORT"))),f.scope);
        assertEquals(1,found.getItems().size());assertEquals(101L,found.getItems().get(0).get("id"));
        assertEquals("炒熟",service.read(7L,f.call("get_dish_methods","dish_id",101L),f.scope).getItems().get(0).get("steps"));
        assertEquals(102L,service.read(7L,f.call("get_dish_details","dish_ids",Collections.singletonList(102L)),f.scope).getItems().get(0).get("id"));
        assertThrows(IllegalArgumentException.class,()->service.read(7L,f.call("get_dish_details","dish_ids",Collections.singletonList(104L)),f.scope));
    }
}
