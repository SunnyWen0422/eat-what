package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import static com.eatwhat.service.AssistantV4ContextService.*;

/** Bounded assistant facts derived exclusively from the enriched canonical recipe. */
final class CanonicalAssistantFacts {
    private CanonicalAssistantFacts() {}
    static JsonNode recipe(Dish dish) {
        JsonNode recipe=dish.getRecipe();
        if(recipe==null||!recipe.isObject()||!recipe.path("id").canConvertToLong()||recipe.path("id").asLong()!=dish.getId()
            ||dish.getCatalogRevision()==null||dish.getCatalogRevision().isEmpty())throw new IllegalStateException("当前标准菜谱暂不可用");
        return recipe;
    }
    static Set<String> terms(Dish dish) {
        Set<String> result=new LinkedHashSet<>();
        for(JsonNode line:recipe(dish).path("ingredients")){
            if(!line.path("defaultEnabled").asBoolean(true))continue;
            JsonNode definition=line.path("ingredient");
            if(!definition.isObject()||!line.path("ingredientId").asText().equals(definition.path("id").asText()))throw new IllegalStateException("标准食材定义暂不可用");
            result.add(definition.path("id").asText().toLowerCase(Locale.ROOT));result.add(definition.path("name").asText().toLowerCase(Locale.ROOT));
            for(JsonNode alias:definition.path("aliases"))result.add(alias.asText().toLowerCase(Locale.ROOT));
            for(JsonNode child:definition.path("constituentIngredients"))addTerms(result,child);
        }
        return result;
    }
    private static void addTerms(Set<String> out,JsonNode definition){out.add(definition.path("id").asText().toLowerCase(Locale.ROOT));out.add(definition.path("name").asText().toLowerCase(Locale.ROOT));for(JsonNode alias:definition.path("aliases"))out.add(alias.asText().toLowerCase(Locale.ROOT));for(JsonNode child:definition.path("constituentIngredients"))addTerms(out,child);}
    static List<String> strings(JsonNode values){List<String> out=new ArrayList<>();for(JsonNode value:values)out.add(value.asText());return out;}
    static Map<String,Object> summary(Dish dish){
        JsonNode recipe=recipe(dish);Map<String,Object> out=dishSummary(dish);
        out.put("catalogRevision",dish.getCatalogRevision());out.put("catalogContractVersion",4);out.put("quantityPolicy","fixed-recipe-v1");out.put("basePeople",CanonicalRecipeCalculator.nullableNumber(recipe,"baseServings"));
        out.put("categoryCode",recipe.path("categoryCode").asText());out.put("mealCodes",strings(recipe.path("mealCodes")));
        out.put("dietaryCodes",recipe.path("dietaryCodes").isArray()?strings(recipe.path("dietaryCodes")):null);out.put("allergenCodes",recipe.path("allergenCodes").isArray()?strings(recipe.path("allergenCodes")):null);
        out.put("nutrition",recipe.path("calculatedNutrition"));
        out.put("detailLevel","summary");return out;
    }
    static Map<String,Object> details(Dish dish){
        JsonNode recipe=recipe(dish);Map<String,Object> out=summary(dish);out.put("detailLevel","full");
        List<Map<String,Object>> facts=new ArrayList<>();List<String> names=new ArrayList<>(),steps=new ArrayList<>();List<Map<String,Object>> stepFacts=new ArrayList<>();
        for(JsonNode line:recipe.path("ingredients")){
            JsonNode definition=line.path("ingredient");String name=definition.path("name").asText();if(line.path("defaultEnabled").asBoolean(true))names.add(name);
            facts.add(map("lineId",line.path("id").asText(),"ingredientId",line.path("ingredientId").asText(),"name",name,
                "quantityValue",CanonicalRecipeCalculator.nullableNumber(line,"quantity"),"quantityKind",line.path("quantityKind").asText("exact"),"quantityDisplay",line.path("quantityDisplay").asText(null),"unit",line.path("unit").asText(),"optional",line.path("optional").asBoolean(),
                "defaultEnabled",line.path("defaultEnabled").asBoolean(true),"preparation",line.path("preparation").asText()));
        }
        for(JsonNode step:recipe.path("steps")){steps.add(step.path("text").asText());stepFacts.add(map("id",step.path("id").asText(),"text",step.path("text").asText(),"ingredientLineIds",strings(step.path("ingredientLineIds"))));}
        out.put("ingredientFacts",facts);out.put("ingredients",String.join("、",names));out.put("steps",String.join("\n",steps));out.put("stepFacts",stepFacts);
        out.put("methods",String.join(",",strings(recipe.path("methodCodes"))));return out;
    }
    static boolean additional(Dish dish,Map<String,Object> filters){
        JsonNode recipe=recipe(dish);
        for(String[] pair:new String[][]{{"meal_codes","mealCodes"},{"dietary_codes","dietaryCodes"},{"excluded_allergen_codes","allergenCodes"}}){
            Object raw=filters.get(pair[0]);if(raw==null)continue;
            if(!(raw instanceof List)||((List<?>)raw).size()>30)throw new IllegalArgumentException("筛选参数无效");
            Set<String> wanted=new HashSet<>();for(Object value:(List<?>)raw){if(!(value instanceof String)||((String)value).isEmpty()||((String)value).length()>40)throw new IllegalArgumentException("筛选参数无效");wanted.add((String)value);}
            Set<String> known=new HashSet<>(strings(recipe.path(pair[1])));
            if(!wanted.isEmpty()&&!recipe.path(pair[1]).isArray())return false;
            if(pair[0].equals("dietary_codes")&&!known.containsAll(wanted))return false;
            if(pair[0].equals("meal_codes")&&!wanted.isEmpty()&&Collections.disjoint(wanted,known))return false;
            if(pair[0].equals("excluded_allergen_codes")&&!Collections.disjoint(wanted,known))return false;
        }
        return true;
    }
}
