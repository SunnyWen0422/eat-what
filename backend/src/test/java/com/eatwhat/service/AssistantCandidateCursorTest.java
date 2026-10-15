package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.Dish;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantCandidateCursorTest {
    private List<Dish> rows(){List<Dish> rows=new ArrayList<>();for(long id=1;id<=12;id++)rows.add(AssistantReadToolTest.Fixture.dish(id,"菜"+id));return rows;}
    private void pool(AssistantReadToolTest.Fixture f,List<Dish> rows){
        when(f.candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenReturn(rows);
        when(f.dishes.getDishesByIdsForUser(anyList(),eq(7L))).thenAnswer(call->{List<Long> ids=call.getArgument(0);return rows.stream().filter(d->ids.contains(d.getId())).collect(Collectors.toList());});
    }
    @Test void newSearchCursorRetainsExactContinuationAndRejectsChangedCatalogOrFilters(){
        AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();List<Dish> rows=rows();pool(f,rows);AssistantReadToolService service=f.reads();
        ReadResult first=service.read(7L,f.call("search_dishes","top_k",2),f.scope);
        assertTrue(first.getNextCursor().startsWith("c2."));
        ReadResult second=service.read(7L,f.call("search_dishes","top_k",2,"cursor",first.getNextCursor()),f.scope);
        assertEquals(first.getSourceVersion(),second.getSourceVersion());assertNotEquals(first.getItems().get(0).get("id"),second.getItems().get(0).get("id"));
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.read(7L,f.call("search_dishes","query","其他词","cursor",first.getNextCursor()),f.scope));
        rows.get(5).setCl("目录里的用料改了");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.read(7L,f.call("search_dishes","cursor",first.getNextCursor()),f.scope));
    }
    @Test void oldNumericCursorIsOnlyACompatibilityReadAndNewResponsesAlwaysUseBoundReferences(){
        AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();pool(f,rows());ReadResult result=f.reads().read(7L,f.call("search_dishes","top_k",2,"cursor","1"),f.scope);
        assertTrue(result.getNextCursor().startsWith("c2."));assertEquals(2,result.getItems().size());
    }
}
