package com.eatwhat.service;

import com.eatwhat.dto.CatalogQuality;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantSearchSummaryTest {
    private AssistantReadToolTest.Fixture catalog(List<Dish> source) {
        AssistantReadToolTest.Fixture f = new AssistantReadToolTest.Fixture();
        when(f.candidates.findRawForUser(anyLong(), any(), any(), any(), anyInt())).thenReturn(source);
        when(f.dishes.getDishesByIdsForUser(anyList(), eq(7L))).thenAnswer(i -> {
            List<Long> ids = i.getArgument(0);
            return source.stream().filter(d -> ids.contains(d.getId())).collect(Collectors.toList());
        });
        return f;
    }
    private Dish longRecipe(long id) {
        Dish d = AssistantReadToolTest.Fixture.dish(id, "家常炖菜" + id);
        d.setType(Arrays.asList("meat", "veg", "soup").get((int) (id % 3)));
        d.setCl(String.join("，", Collections.nCopies(35, "青菜100克、豆腐200克、葱姜蒜少许")));
        com.fasterxml.jackson.databind.node.ObjectNode recipe=d.getRecipe().deepCopy();recipe.putNull("baseServings");
        com.fasterxml.jackson.databind.node.ArrayNode lines=recipe.putArray("ingredients");
        for(int n=0;n<25;n++){com.fasterxml.jackson.databind.node.ObjectNode line=lines.addObject();line.put("id","i"+n);line.put("ingredientId","green"+n);line.put("unit","g");line.putNull("quantity");line.put("quantityKind","discretionary");line.put("quantityDisplay","适量");line.put("defaultEnabled",true);line.put("optional",false);line.put("role","main");com.fasterxml.jackson.databind.node.ObjectNode def=line.putObject("ingredient");def.put("id","green"+n);def.put("name",n==0?"青菜":"新鲜食材"+n);}
        d.setRecipe(recipe);return d;
    }
    @Test void defaultSearchWithRealisticLongRecipesLeavesRoomForFollowupAndKeepsDetailsOnDemand() throws Exception {
        List<Dish> source = new ArrayList<>(); for (long id = 101; id <= 110; id++) source.add(longRecipe(id));
        AssistantReadToolTest.Fixture f = catalog(source); AssistantReadToolService reads = f.reads();
        ReadResult result = reads.read(7L, f.call("search_dishes"), f.scope);
        assertTrue(f.json.writeValueAsString(result).length() <= 4000, "Search result including envelope must fit its budget");
        assertTrue(result.getItems().size()>0&&result.getItems().size()<=10); assertEquals(result.getItems().size()<10,result.isTruncated());
        assertEquals(new HashSet<>(Arrays.asList("meat", "veg", "soup")), result.getItems().stream().map(r -> r.get("type")).collect(Collectors.toSet()));
        Set<Long> returned = result.getItems().stream().map(r -> (Long) r.get("id")).collect(Collectors.toSet());
        assertEquals(returned, f.scope.getAuthorizedDishIds());
        for (Map<String,Object> row : result.getItems()) {
            assertEquals("summary", row.get("detailLevel")); assertFalse(row.containsKey("ingredientFacts"));
            assertFalse(row.containsKey("ingredients")); assertNull(row.get("basePeople"));
            assertTrue(((List<?>) row.get("omittedFields")).contains("ingredientFacts"));
            assertTrue(result.getUnknownFields().contains("basePeople:" + row.get("id")));
            assertFalse(result.getUnknownFields().contains("ingredientFacts:" + row.get("id")));
        }
        ReadResult detail = reads.read(7L, f.call("get_dish_details", "dish_ids", Collections.singletonList(101L)), f.scope);
        Map<String,Object> full = detail.getItems().get(0);
        assertEquals("full", full.get("detailLevel")); assertTrue(String.valueOf(full.get("ingredients")).startsWith("青菜、新鲜食材1"));
        List<?> facts = (List<?>) full.get("ingredientFacts"); assertEquals(25, facts.size());
        assertNull(((Map<?,?>) facts.get(0)).get("quantityValue"));
        assertEquals("discretionary", ((Map<?,?>) facts.get(0)).get("quantityKind"));assertEquals("适量", ((Map<?,?>) facts.get(0)).get("quantityDisplay"));
    }
    @Test void budgetPagingReturnsEveryCandidateOnceAndAuthorizesOnlyEmittedIds() throws Exception {
        List<Dish> source = new ArrayList<>();
        for (long id = 101; id <= 135; id++) { Dish d = longRecipe(id); d.setTagCodes(String.join("", Collections.nCopies(900, "A"))); source.add(d); }
        AssistantReadToolTest.Fixture f = catalog(source); AssistantReadToolService reads = f.reads();
        String cursor = null; Set<Long> seen = new HashSet<>(); int pages = 0;
        do {
            ToolRead call = f.call("search_by_ingredients", "ingredients", Collections.singletonList("青菜"), "top_k", 30);
            if (cursor != null) call.getArguments().put("cursor", cursor);
            ReadResult page = reads.read(7L, call, f.scope);
            assertTrue(f.json.writeValueAsString(page).length() <= 4000); assertFalse(page.getItems().isEmpty());
            for (Map<String,Object> row : page.getItems()) assertTrue(seen.add((Long) row.get("id")), "Duplicate or skipped cursor");
            assertEquals(seen, f.scope.getAuthorizedDishIds());
            if (page.isTruncated()) {
                assertEquals(String.valueOf(seen.size()), page.getNextCursor().split("\\.")[1]);
                assertTrue(page.getNextCursor().endsWith("." + page.getSourceVersion()));
            }
            cursor = page.getNextCursor(); assertTrue(++pages <= 35);
        } while (cursor != null);
        assertEquals(35, seen.size()); assertTrue(pages > 1);
    }
    @Test void oversizedSingleSummaryExplicitlyOmitsBulkyFieldAndStillAdvancesCursor() throws Exception {
        Dish d = longRecipe(101); d.setTagCodes(String.join("", Collections.nCopies(2000, "\n")));
        Dish second = longRecipe(102); second.setType("soup");
        AssistantReadToolTest.Fixture f = catalog(Arrays.asList(d, second));
        AssistantReadToolService reads = f.reads();
        ReadResult first = reads.read(7L, f.call("search_dishes", "top_k", 1), f.scope);
        assertTrue(f.json.writeValueAsString(first).length() <= 4000);
        assertEquals(101L, first.getItems().get(0).get("id")); assertEquals("soup", first.getItems().get(0).get("type"));
        assertFalse(first.getItems().get(0).containsKey("tagCodes"));
        assertTrue(((List<?>) first.getItems().get(0).get("omittedFields")).contains("tagCodes"));
        assertEquals("1", first.getNextCursor().split("\\.")[1]);
        ReadResult next = reads.read(7L, f.call("search_dishes", "top_k", 1, "cursor", first.getNextCursor()), f.scope);
        assertEquals(102L, next.getItems().get(0).get("id")); assertFalse(next.isTruncated());
    }
}
