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
            if (d.getRecipeJson()!=null) return canonical(d);
            return WorkflowRequestHash.sha256(JSON.writeValueAsString(Arrays.asList(
                d.getName(), d.getType(), d.getCl(), d.getFl(), d.getStep(), d.getIngredientsAmounts(),
                d.getSteps(), d.getStepImages(), d.getTips(), d.getTags(), d.getCuisineCode(), d.getTagCodes(),
                d.getCookMinutes(), d.getMetadataVersion(), d.getImage(), d.getDifficulty(), d.getCookTime(),
                d.getMethods(), d.getKcal(), d.getQuality()==null?null:d.getQuality().getContentHash())));
        } catch (java.io.IOException error) { throw new IllegalStateException("菜品版本无法读取", error); }
    }
    private static String canonical(Dish d) throws java.io.IOException {
        Object value=JSON.readerFor(Object.class).with(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readValue(d.getRecipeJson());
        return WorkflowRequestHash.sha256(JSON.writeValueAsString(canonicalNumbers(value)));
    }
    private static Object canonicalNumbers(Object value) {
        if (value instanceof Number) {
            java.math.BigDecimal number=new java.math.BigDecimal(value.toString()).stripTrailingZeros();
            return number.scale()<0?number.setScale(0):number;
        }
        if (value instanceof java.util.Map) {
            java.util.Map<String,Object> result=new java.util.TreeMap<>();
            ((java.util.Map<?,?>)value).forEach((key,item)->result.put(key.toString(),canonicalNumbers(item)));
            return result;
        }
        if (value instanceof java.util.List) {
            java.util.List<Object> result=new java.util.ArrayList<>();
            for(Object item:(java.util.List<?>)value)result.add(canonicalNumbers(item));
            return result;
        }
        return value;
    }
    public static String rawOf(Dish d) {
        try {if (d.getRecipeJson()!=null) return canonical(d); return WorkflowRequestHash.sha256(JSON.writeValueAsString(Arrays.asList(
            d.getName(),d.getType(),d.getCl(),d.getFl(),d.getStep(),d.getIngredientsAmounts(),d.getSteps(),d.getStepImages(),d.getTips(),d.getTags(),d.getCuisineCode(),d.getTagCodes(),d.getCookMinutes(),d.getMetadataVersion(),d.getImage(),d.getDifficulty(),d.getCookTime(),d.getMethods(),d.getKcal())));
        }catch(java.io.IOException e){throw new IllegalStateException("原配方指纹无法读取",e);}
    }
}
