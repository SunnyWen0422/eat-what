package com.eatwhat.service;

import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.HashMap;

@Service
public class DishCandidateQueryService {
    @org.springframework.beans.factory.annotation.Autowired(required=false) private ExperienceMetrics metrics;

    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}

    private final DishMapper dishMapper;

    public DishCandidateQueryService(DishMapper dishMapper) {
        this.dishMapper = dishMapper;
    }

    /** Caller supplies normalized page bounds and a consistent read transaction. */
    public DishPageDTO findRawPageForUser(Long userId, String type, String keyword,
                                         RecommendationCriteria criteria, int page, int pageSize) {
        RecommendationCriteria value = criteria == null ? new RecommendationCriteria() : criteria;
        String safeType = blankToNull(type);
        String safeKeyword = blankToNull(keyword);
        long offset = ((long) page - 1) * pageSize;
        if (safe(value.getExcludeTagCodes()).isEmpty() && safe(value.getExcludedIngredients()).isEmpty()) {
            int total = observedCountFilteredDishes(userId, safeType, safeKeyword,
                    safe(value.getCuisineCodes()), safe(value.getIncludeTagCodes()), value.getMaxCookMinutes());
            List<Dish> rows = offset >= total ? Collections.emptyList() :
                    observedSelectFilteredDishesPage(userId, safeType, safeKeyword,
                            safe(value.getCuisineCodes()), safe(value.getIncludeTagCodes()), value.getMaxCookMinutes(), pageSize, offset);
            return new DishPageDTO(rows, total, page, pageSize);
        }

        int total = 0;
        Long beforeId = null;
        List<Long> selected = new ArrayList<>();
        for (;;) {
            List<Dish> batch = observedSelectFilteredCandidateFacts(userId, blankToNull(type), blankToNull(keyword),
                    safe(value.getCuisineCodes()), safe(value.getIncludeTagCodes()), value.getMaxCookMinutes(), beforeId, 256);
            if (batch == null || batch.isEmpty()) break;
            for (Dish dish : batch) {
                if (hasExcludedTag(dish, value.getExcludeTagCodes()) || containsExcludedIngredient(dish, value.getExcludedIngredients())) continue;
                if (total >= offset && selected.size() < pageSize) selected.add(dish.getId());
                total = Math.incrementExact(total);
            }
            beforeId = batch.get(batch.size() - 1).getId();
            if (batch.size() < 256) break;
        }
        List<Dish> result = new ArrayList<>();
        if (!selected.isEmpty()) {
            Map<Long,Dish> details = new HashMap<>();
            for (Dish dish : observedSelectFilteredPageDetails(selected, userId)) details.put(dish.getId(), dish);
            for (Long id : selected) {
                Dish dish = details.get(id);
                if (dish == null) throw new IllegalStateException("菜谱目录已变化，请重新读取");
                result.add(dish);
            }
        }
        return new DishPageDTO(result, total, page, pageSize);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<Dish> findForUser(Long userId,
                                  String type,
                                  String keyword,
                                  RecommendationCriteria criteria,
                                  int maxResults) {
        List<Dish> result = detailsForFacts(userId,findRawForUser(userId, type, keyword, criteria, maxResults));
        if (quality != null && !result.isEmpty()) quality.enrich(result);
        return result;
    }

    /** Per-request scoped scan. No shared cache; callers own a consistent read transaction.
     * Returned rows are selection facts, not complete recipes or content-version evidence. */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<Dish> findRawForUser(Long userId,
                                     String type,
                                     String keyword,
                                     RecommendationCriteria criteria,
                                     int maxResults) {
        RecommendationCriteria value = criteria == null ? new RecommendationCriteria() : criteria;
        int limit = Math.max(1, maxResults);
        List<Dish> result = new ArrayList<>();
        Set<Long> seen=new HashSet<>();Long beforeId=null;
        for(;;){
            List<Dish> batch=observedSelectRecommendationCandidateFacts(userId,blankToNull(type),blankToNull(keyword),
                    safe(value.getCuisineCodes()),safe(value.getIncludeTagCodes()),value.getMaxCookMinutes(),beforeId,256);
            if(batch==null||batch.isEmpty())break;
            if(batch.size()>256)throw new IllegalStateException("候选读取超出范围");
            for(Dish dish:batch){
                if(dish==null||dish.getId()==null||!seen.add(dish.getId())||(dish.getUserId()!=null&&!dish.getUserId().equals(userId)))throw new IllegalStateException("菜谱目录已变化，请重新读取");
                if(hasExcludedTag(dish,value.getExcludeTagCodes())||containsExcludedIngredient(dish,value.getExcludedIngredients()))continue;
                result.add(dish);if(result.size()>=limit)return result;
            }
            Long next=batch.get(batch.size()-1).getId();
            if(beforeId!=null&&next>=beforeId)throw new IllegalStateException("菜谱目录已变化，请重新读取");
            beforeId=next;if(batch.size()<256)break;
        }
        return result;
    }

    /** Materialize only selected IDs, preserving order and rejecting changed selection facts. */
    public List<Dish> detailsForFacts(Long user,List<Dish> facts){
        List<Dish> result=new ArrayList<>();
        for(int from=0;from<facts.size();from+=256){
            List<Dish> part=facts.subList(from,Math.min(facts.size(),from+256));
            List<Long> ids=new ArrayList<>();for(Dish d:part)ids.add(d.getId());
            Map<Long,Dish> byId=new HashMap<>();List<Dish> rows=observedSelectFilteredPageDetails(ids,user);
            if(rows!=null)for(Dish d:rows)if(d.getUserId()==null||d.getUserId().equals(user))byId.put(d.getId(),d);
            for(Dish fact:part){Dish detail=byId.get(fact.getId());if(detail==null||!sameSelectionFacts(fact,detail))throw new MealConsumptionService.VersionConflict("候选菜品已变化，请重新查询");result.add(detail);}
        }
        return result;
    }

    private int observedCountFilteredDishes(Long user,String type,String keyword,List<String> cuisines,List<String> tags,Integer max){
        long start=System.nanoTime();String outcome="error";
        try{int total=dishMapper.countFilteredDishes(user,type,keyword,cuisines,tags,max);outcome="success";return total;}
        finally{ExperienceMetrics.observe(metrics,"candidate_scan",outcome,java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),0);}
    }
    private List<Dish> observedSelectRecommendationCandidateFacts(Long user,String type,String keyword,List<String> cuisines,List<String> tags,Integer max,Long before,int limit){
        return ExperienceMetrics.rows(metrics,"candidate_scan",()->dishMapper.selectRecommendationCandidateFacts(user,type,keyword,cuisines,tags,max,before,limit));
    }
    private List<Dish> observedSelectFilteredCandidateFacts(Long user,String type,String keyword,List<String> cuisines,List<String> tags,Integer max,Long before,int limit){
        return ExperienceMetrics.rows(metrics,"candidate_scan",()->dishMapper.selectFilteredCandidateFacts(user,type,keyword,cuisines,tags,max,before,limit));
    }
    private List<Dish> observedSelectFilteredDishesPage(Long user,String type,String keyword,List<String> cuisines,List<String> tags,Integer max,int limit,long offset){
        return ExperienceMetrics.rows(metrics,"candidate_details",()->dishMapper.selectFilteredDishesPage(user,type,keyword,cuisines,tags,max,limit,offset));
    }
    private List<Dish> observedSelectFilteredPageDetails(List<Long> ids,Long user){
        return ExperienceMetrics.rows(metrics,"candidate_details",()->dishMapper.selectFilteredPageDetails(ids,user));
    }
    private boolean sameSelectionFacts(Dish a,Dish b){
        return java.util.Objects.equals(a.getName(),b.getName())&&java.util.Objects.equals(a.getType(),b.getType())
            &&java.util.Objects.equals(a.getCl(),b.getCl())&&java.util.Objects.equals(a.getIngredientsAmounts(),b.getIngredientsAmounts())
            &&java.util.Objects.equals(a.getTagCodes(),b.getTagCodes())&&java.util.Objects.equals(a.getCuisineCode(),b.getCuisineCode())
            &&java.util.Objects.equals(a.getCookMinutes(),b.getCookMinutes())&&java.util.Objects.equals(a.getMetadataVersion(),b.getMetadataVersion())
            &&java.util.Objects.equals(a.getUserId(),b.getUserId());
    }

    private boolean hasExcludedTag(Dish dish, List<String> exclusions) {
        if (exclusions == null || exclusions.isEmpty()) return false;
        Set<String> tags = splitCodes(dish.getTagCodes());
        for (String code : exclusions) {
            if (code != null && tags.contains(code.trim().toUpperCase())) return true;
        }
        return false;
    }

    private boolean containsExcludedIngredient(Dish dish, List<String> exclusions) {
        if (exclusions == null || exclusions.isEmpty()) return false;
        String searchable = null;
        for (String excluded : exclusions) {
            if (excluded == null || excluded.trim().isEmpty()) continue;
            String term = excluded.trim();
            // Han characters have no lowercase mapping, and a Han-only term
            // cannot span the space separating the two source fields. Avoid
            // copying and case-scanning large ingredient bodies in this path.
            if (isHanOnly(term)) {
                if ((dish.getCl() != null && dish.getCl().contains(term))
                        || (dish.getIngredientsAmounts() != null && dish.getIngredientsAmounts().contains(term))) return true;
            } else {
                // Retain the original default-locale and cross-field matching
                // semantics for Latin, whitespace, punctuation and Unicode.
                if (searchable == null) searchable = ((dish.getCl() == null ? "" : dish.getCl()) + " "
                        + (dish.getIngredientsAmounts() == null ? "" : dish.getIngredientsAmounts())).toLowerCase();
                if (searchable.contains(term.toLowerCase())) return true;
            }
        }
        return false;
    }

    private boolean isHanOnly(String term) {
        for (int i = 0; i < term.length(); i++) {
            char value = term.charAt(i);
            if (value < '\u3400' || value > '\u9fff') return false;
        }
        return !term.isEmpty();
    }

    private Set<String> splitCodes(String value) {
        Set<String> result = new HashSet<>();
        if (value == null) return result;
        for (String item : value.split(",")) {
            if (!item.trim().isEmpty()) result.add(item.trim().toUpperCase());
        }
        return result;
    }

    private List<String> safe(List<String> values) {
        return values == null ? Collections.<String>emptyList() : values;
    }

    private String blankToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
