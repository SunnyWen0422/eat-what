package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class DishRecipeReaderTest {
    private static final String RECIPE = "{\"name\":\"菜\",\"quantity\":0.1234567890123456789012345,\"missing\":null,\"steps\":[\"洗净\"]}";

    @Test void catalogBatchParsingHasABoundedAllocationBudget() {
        java.lang.management.ThreadMXBean base = ManagementFactory.getThreadMXBean();
        assumeTrue(base instanceof com.sun.management.ThreadMXBean);
        com.sun.management.ThreadMXBean meter = (com.sun.management.ThreadMXBean) base;
        assumeTrue(meter.isThreadAllocatedMemorySupported());
        if (!meter.isThreadAllocatedMemoryEnabled()) meter.setThreadAllocatedMemoryEnabled(true);
        for (int i=0;i<64;i++) new Dish().setRecipeJson(RECIPE);
        long thread=Thread.currentThread().getId(), before=meter.getThreadAllocatedBytes(thread);
        for (int i=0;i<512;i++) {
            Dish dish=new Dish();dish.setRecipeJson(RECIPE);
            assertEquals(new BigDecimal("0.1234567890123456789012345"),dish.getRecipe().path("quantity").decimalValue());
        }
        long allocated=meter.getThreadAllocatedBytes(thread)-before;
        System.out.println("Candidate JSON reader allocated bytes: "+allocated);
        assertTrue(allocated < 2L*1024*1024,"Two candidate batches allocated "+allocated+" bytes for small JSON documents");
    }

    @Test void parallelReadsKeepExactValuesAndIndependentTrees() throws Exception {
        ExecutorService workers=Executors.newFixedThreadPool(4);
        try {
            List<Future<Dish>> results=new ArrayList<>();
            for(int i=0;i<40;i++) results.add(workers.submit(()->{Dish dish=new Dish();dish.setRecipeJson(RECIPE);return dish;}));
            List<Dish> dishes=new ArrayList<>();for(Future<Dish> result:results)dishes.add(result.get(10,TimeUnit.SECONDS));
            ((com.fasterxml.jackson.databind.node.ObjectNode)dishes.get(0).getRecipe()).put("name","changed");
            for(int i=1;i<dishes.size();i++) {
                assertEquals("菜",dishes.get(i).getRecipe().path("name").asText());
                assertTrue(dishes.get(i).getRecipe().path("missing").isNull());
                assertEquals(RECIPE,dishes.get(i).getRecipeJson());
                assertEquals(dishes.get(1).getContentVersion(),dishes.get(i).getContentVersion());
            }
        } finally { workers.shutdownNow(); }
    }
}
