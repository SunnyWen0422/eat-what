package com.eatwhat.service;
import com.eatwhat.dto.CatalogQuality;
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
