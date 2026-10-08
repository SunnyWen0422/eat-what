package com.eatwhat.util;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;

/** Content-based revision also detects legacy/admin/import writes without a shared counter. */
public final class DishContentVersion {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DishContentVersion() { }
    public static String of(Dish d) {
        if (d == null) throw new IllegalArgumentException("菜品不存在");
        try {
            return WorkflowRequestHash.sha256(JSON.writeValueAsString(Arrays.asList(
                d.getName(), d.getType(), d.getCl(), d.getFl(), d.getStep(), d.getIngredientsAmounts(),
                d.getSteps(), d.getStepImages(), d.getTips(), d.getTags(), d.getCuisineCode(), d.getTagCodes(),
                d.getCookMinutes(), d.getMetadataVersion(), d.getImage(), d.getDifficulty(), d.getCookTime(),
                d.getMethods(), d.getKcal())));
        } catch (java.io.IOException error) { throw new IllegalStateException("菜品版本无法读取", error); }
    }
}
