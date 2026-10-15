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
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;
    public DishQualityService(DishQualityMapper mapper,ObjectMapper json){this.mapper=mapper;this.json=json;}
    /** Called after the food insert, inside the copy transaction, so evidence has its own identity. */
    public void inheritCopy(Dish source,Dish copy) {
        if(source.getQuality()==null)return;
        CatalogQuality inherited=json.convertValue(source.getQuality(),CatalogQuality.class);
        inherited.setCopiedFromDishId(source.getId());
        inherited.setCopiedFromVersion(source.getContentVersion());
        persist(copy,inherited);
    }
    /** Persist only the final edited copy's evidence, without creating an intermediate profile. */
    public void inheritEditedCopy(Dish source,Dish copy) {
        if(source.getQuality()==null)return;
        CatalogQuality inherited=json.convertValue(source.getQuality(),CatalogQuality.class);
        inherited.setCopiedFromDishId(source.getId());
        inherited.setCopiedFromVersion(source.getContentVersion());
        applyEditEvidence(source,copy,inherited);
        persist(copy,inherited);
    }
    /** Rebind benign edits; changed recipe facts must not retain the source's review assertion. */
    public void reconcileEdit(Dish current,Dish next) {
        if(current.getQuality()==null)return;
        CatalogQuality q=json.convertValue(current.getQuality(),CatalogQuality.class);
        applyEditEvidence(current,next,q);
        persist(next,q);
    }
    private void applyEditEvidence(Dish current,Dish next,CatalogQuality q) {
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
        Map<Long,CatalogQuality> profiles=new HashMap<>();Set<Long> seen=new HashSet<>(),invalid=new HashSet<>();Map<Long,List<String>> evidence=new HashMap<>();
        List<DishQualityMapper.Row> rows=mapper.find(ids);
        if(rows==null)throw new IllegalStateException("菜谱资料暂未读到");
        for(DishQualityMapper.Row row:rows){
            if(row==null||!ids.contains(row.getDishId()))continue;
            evidence.computeIfAbsent(row.getDishId(),key->new ArrayList<>()).add(com.eatwhat.util.WorkflowRequestHash.sha256(String.valueOf(row.getProfileJson())));
            if(!seen.add(row.getDishId())){invalid.add(row.getDishId());profiles.remove(row.getDishId());continue;}
            try {
                if(row.getProfileJson()==null||row.getProfileJson().length()>1024*1024)throw new IllegalArgumentException();
                CatalogQuality q=json.readValue(row.getProfileJson(),CatalogQuality.class);
                if(q==null||!Objects.equals(row.getDishId(),q.getDishId())||q.getIngredients()==null||q.getIngredients().isEmpty()||q.getIngredients().size()>500||q.getIssueCodes()==null||q.getRejectedIngredients()==null)throw new IllegalArgumentException();
                for(CatalogQuality.Ingredient fact:q.getIngredients())if(fact==null||fact.getName()==null||fact.getName().trim().isEmpty()||fact.getName().length()>255)throw new IllegalArgumentException();
                profiles.put(row.getDishId(),q);
            }catch(java.io.IOException|IllegalArgumentException e){invalid.add(row.getDishId());profiles.remove(row.getDishId());}
        }
        for(Dish d:dishes)if(d!=null&&seen.contains(d.getId())){
            CatalogQuality q=profiles.get(d.getId());
            if(invalid.contains(d.getId())||q==null)q=untrusted(d,"QUALITY_RECORD_INVALID",evidence.get(d.getId()));
            else if(("VERIFIED".equals(q.getReviewStatus())||q.getSourceRecipeVersion()!=null)&&!com.eatwhat.util.DishContentVersion.rawOf(d).equals(q.getSourceRecipeVersion()))q=untrusted(d,"QUALITY_VERSION_CHANGED",evidence.get(d.getId()));
            d.setQuality(q);
        }
        if(metrics!=null&&!invalid.isEmpty())metrics.recordStage("quality","degraded",0,invalid.size());
        return dishes;
    }
    /** A sentinel prevents unsafe legacy quantity parsing after evidence corruption. */
    private CatalogQuality untrusted(Dish dish,String reason,List<String> evidence){
        CatalogQuality q=new CatalogQuality();q.setDishId(dish.getId());q.setSourceRecipeVersion(com.eatwhat.util.DishContentVersion.rawOf(dish));
        List<String> hashes=new ArrayList<>(evidence);Collections.sort(hashes);
        q.setContentHash(com.eatwhat.util.WorkflowRequestHash.sha256(q.getSourceRecipeVersion()+"|"+reason+"|"+String.join("|",hashes)));
        q.setReviewStatus("UNREVIEWED");q.setSourceKind("QUALITY_UNAVAILABLE");q.setServingsStatus("UNKNOWN");
        q.setStepStatus("UNKNOWN");q.setNutritionStatus("UNKNOWN");q.setTimeStatus("UNKNOWN");q.setImageRightsStatus("UNKNOWN");q.getIssueCodes().add(reason);
        String raw=dish.getIngredientsAmounts();if(raw==null||raw.trim().isEmpty())raw=dish.getCl();
        if(raw!=null&&raw.length()<=128000)for(IngredientParseResult parsed:new IngredientParserService().parseStructured(raw,null)){
            if(q.getIngredients().size()>=500)break;
            CatalogQuality.Ingredient fact=new CatalogQuality.Ingredient();fact.setName(parsed.getIngredientName());
            fact.setRawText(parsed.getSourceText());fact.setPreparation(parsed.getPreparation());fact.setRole(parsed.getCategory());
            fact.setIdentityStatus("UNREVIEWED");fact.setQuantityStatus("UNKNOWN");fact.setDisplayQuantity("用量待核实");q.getIngredients().add(fact);
        }
        return q;
    }
    /** Readiness is not a price quote or a public-release permission. */
    public Map<String,Object> getEffectiveCapabilities(Dish dish,CatalogQuality q){
        boolean readable=dish!=null&&dish.getName()!=null&&!dish.getName().trim().isEmpty();
        boolean version=q!=null&&dish!=null&&com.eatwhat.util.DishContentVersion.rawOf(dish).equals(q.getSourceRecipeVersion());
        boolean scale=version&&"VERIFIED".equals(q.getReviewStatus())&&"VERIFIED".equals(q.getServingsStatus())&&q.getBasePeople()!=null&&q.getBasePeople().signum()>0&&q.getIngredients()!=null&&!q.getIngredients().isEmpty();
        if(scale)for(CatalogQuality.Ingredient fact:q.getIngredients())if(fact==null||!fact.verifiedQuantity()||!Arrays.asList("克","毫升","个").contains(fact.getUnit()))scale=false;
        Map<String,Object> result=new LinkedHashMap<>();result.put("browsable",readable);
        result.put("recommendable",readable&&((dish.getStep()!=null&&!dish.getStep().trim().isEmpty())||(dish.getSteps()!=null&&!dish.getSteps().trim().isEmpty())));
        result.put("scalable",scale);result.put("priceable",scale);
        result.put("reasons",q==null?Collections.singletonList("QUALITY_UNKNOWN"):new ArrayList<>(q.getIssueCodes()==null?Collections.emptyList():q.getIssueCodes()));return result;
    }
}
