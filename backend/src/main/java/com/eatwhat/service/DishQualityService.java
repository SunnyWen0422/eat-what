package com.eatwhat.service;
import com.eatwhat.dto.CatalogQuality;
import com.eatwhat.dto.IngredientParseResult;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
/** Attaches evidence after ownership checks. Raw recipe snapshots stay intact. */
@Service
public class DishQualityService {
    private final DishQualityMapper mapper;private final ObjectMapper json;
    public DishQualityService(DishQualityMapper mapper,ObjectMapper json){this.mapper=mapper;this.json=json;}
    /** Called after the food insert, inside the copy transaction, so evidence has its own identity. */
    public void inheritCopy(Dish source,Dish copy) {
        if(source.getQuality()==null)return;
        CatalogQuality inherited=json.convertValue(source.getQuality(),CatalogQuality.class);
        inherited.setCopiedFromDishId(source.getId());
        inherited.setCopiedFromVersion(source.getContentVersion());
        persist(copy,inherited);
    }
    /** Rebind benign edits; changed recipe facts must not retain the source's review assertion. */
    public void reconcileEdit(Dish current,Dish next) {
        if(current.getQuality()==null)return;
        CatalogQuality q=json.convertValue(current.getQuality(),CatalogQuality.class);
        boolean amountsChanged=!Objects.equals(current.getIngredientsAmounts(),next.getIngredientsAmounts());
        boolean ingredientsChanged=amountsChanged||!Objects.equals(current.getCl(),next.getCl());
        boolean stepsChanged=!Objects.equals(current.getStep(),next.getStep())||!Objects.equals(current.getSteps(),next.getSteps())
            ||!Objects.equals(current.getTips(),next.getTips())||!Objects.equals(current.getMethods(),next.getMethods());
        boolean servingsChanged=!Objects.equals(current.getFl(),next.getFl());
        if(ingredientsChanged)q.setIngredients(editedIngredients(amountsChanged?next.getIngredientsAmounts():next.getCl(),q));
        if(ingredientsChanged||stepsChanged||servingsChanged){
            q.setReviewStatus("UNREVIEWED");q.setSourceKind("USER_EDITED");
            q.setReviewedBy(null);q.setReviewedAt(null);q.setCookedAt(null);
            q.setBasePeople(null);q.setServingsStatus("UNKNOWN");q.setNutritionKcal(null);q.setNutritionStatus("UNKNOWN");
            if(ingredientsChanged||stepsChanged)q.setStepStatus("UNKNOWN");
            if(!q.getIssueCodes().contains("PERSONAL_RECIPE_EDITED"))q.getIssueCodes().add("PERSONAL_RECIPE_EDITED");
        }
        if(!Objects.equals(current.getCookMinutes(),next.getCookMinutes())||!Objects.equals(current.getCookTime(),next.getCookTime()))q.setTimeStatus("ESTIMATED");
        if(!Objects.equals(current.getImage(),next.getImage()))q.setImageRightsStatus("UNKNOWN");
        if(!Objects.equals(current.getKcal(),next.getKcal())){q.setNutritionKcal(null);q.setNutritionStatus("UNKNOWN");}
        persist(next,q);
    }
    private List<CatalogQuality.Ingredient> editedIngredients(String text,CatalogQuality prior) {
        Set<String> rejected=new HashSet<>();
        for(CatalogQuality.RejectedIngredient item:prior.getRejectedIngredients())rejected.add(item.getName());
        for(CatalogQuality.Ingredient item:prior.getIngredients())if("REJECTED".equals(item.getIdentityStatus()))rejected.add(item.getName());
        // The editor also supports JSON arrays; normalize their lines before parsing.
        try { Object value=json.readValue(text,Object.class);if(value instanceof List){List<String> lines=new ArrayList<>();for(Object line:(List<?>)value)lines.add(String.valueOf(line));text=String.join("\n",lines);} }
        catch(java.io.IOException ignored){ /* Plain ingredient text is supported. */ }
        List<CatalogQuality.Ingredient> facts=new ArrayList<>();
        for(IngredientParseResult parsed:new IngredientParserService().parseStructured(text,null)) {
            if(rejected.contains(parsed.getIngredientName()))continue;
            CatalogQuality.Ingredient fact=new CatalogQuality.Ingredient();String[] parts=parsed.getSourceText().split("\\|",-1);
            fact.setName(parsed.getIngredientName());fact.setRawText(parsed.getSourceText());
            fact.setRawQuantity(parts.length>1?parts[1]:null);fact.setRawUnit(parts.length>2?parts[2]:null);fact.setUnit(fact.getRawUnit());
            fact.setRole(parsed.getCategory());fact.setPreparation(parsed.getPreparation());fact.setSourceLabel("USER_EDITED");
            fact.setIdentityStatus("UNREVIEWED");fact.setQuantityStatus("UNKNOWN");fact.setDisplayQuantity("用量待核实");facts.add(fact);
        }
        if(facts.isEmpty())throw new IllegalArgumentException("请至少填写一种有效食材");
        return facts;
    }
    private void persist(Dish dish,CatalogQuality q) {
        if(dish.getId()==null)throw new IllegalArgumentException("菜品尚未保存");
        q.setDishId(dish.getId());q.setSourceRecipeVersion(com.eatwhat.util.DishContentVersion.rawOf(dish));q.setContentHash(null);
        try {
            q.setContentHash(com.eatwhat.util.WorkflowRequestHash.sha256(json.writeValueAsString(q)));
            String profile=json.writeValueAsString(q);
            mapper.saveRevision(q,profile);mapper.save(q,profile);dish.setQuality(q);
        }catch(java.io.IOException error){throw new IllegalStateException("菜谱质量记录无法保存",error);}
    }
    public Dish enrich(Dish dish){if(dish!=null)enrich(Collections.singletonList(dish));return dish;}
    public List<Dish> enrich(List<Dish> dishes){
        if(dishes==null||dishes.isEmpty())return dishes;
        List<Long> ids=dishes.stream().filter(Objects::nonNull).filter(d->d.getQuality()==null).map(Dish::getId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if(ids.isEmpty())return dishes;
        Map<Long,CatalogQuality> profiles=new HashMap<>();
        for(DishQualityMapper.Row row:mapper.find(ids)){
            try {
                CatalogQuality q=json.readValue(row.getProfileJson(),CatalogQuality.class);
                if(!Objects.equals(row.getDishId(),q.getDishId())||!ids.contains(row.getDishId())||q.getIngredients()==null||q.getIngredients().isEmpty())throw new IllegalArgumentException();
                if(profiles.put(row.getDishId(),q)!=null)throw new IllegalArgumentException();
            }catch(Exception e){throw new IllegalStateException("菜谱质量记录无法核对，请稍后重试",e);}
        }
        for(Dish d:dishes)if(d!=null&&profiles.containsKey(d.getId())){
            CatalogQuality q=profiles.get(d.getId());
            if("VERIFIED".equals(q.getReviewStatus())&&!com.eatwhat.util.DishContentVersion.rawOf(d).equals(q.getSourceRecipeVersion())){
                throw new IllegalStateException("原配方已变化，需重新核对质量记录后使用已核验用量");
            }
            d.setQuality(q);
        }
        return dishes;
    }
}
