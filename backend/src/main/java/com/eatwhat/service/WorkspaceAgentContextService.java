package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.stereotype.Service;
/** Builds only the authenticated user's task-readable data; contains no open IDs or tokens. */
@Service
public class WorkspaceAgentContextService {
    private final MealWorkspacePlanner planner;private final UserPreferenceService preferences;private final FavoriteDishService favorites;
    private final MealConsumptionMapper actual;private final PersonalMenuService menus;private final RecommendationMetadataService metadata;
    public WorkspaceAgentContextService(MealWorkspacePlanner p,UserPreferenceService u,FavoriteDishService f,MealConsumptionMapper a,PersonalMenuService m,RecommendationMetadataService d){planner=p;preferences=u;favorites=f;actual=a;menus=m;metadata=d;}
    public Map<String,Object> build(Long user,MealWorkspace workspace){
        if(user==null||user<1)throw new IllegalArgumentException("需要有效的当前用户");
        MealContext c=MealWorkspaceRules.normalize(workspace.getContext());List<Dish> eligible=planner.eligible(user,c);
        Set<Long> locked=workspace.getDraft().getLockedDishIds();List<Dish> selected=new ArrayList<>();Set<Long> added=new HashSet<>();
        for(Dish d:eligible){if(d.getUserId()!=null&&!Objects.equals(d.getUserId(),user))throw new IllegalArgumentException("候选菜品归属无效");if(locked.contains(d.getId())){selected.add(d);added.add(d.getId());}}
        if(!added.containsAll(locked))throw new IllegalArgumentException("保留菜品已不可用，请核对本餐");
        for(Dish d:eligible)if(selected.size()<200&&added.add(d.getId()))selected.add(d);
        List<Map<String,Object>> catalog=new ArrayList<>();
        for(Dish d:planner.attachQuality(selected))catalog.add(readable(d));
        Map<String,Object> result=new LinkedHashMap<>();result.put("ownerUserId",user);result.put("catalog",catalog);result.put("preferences",preferences.get(user));result.put("favoriteDishIds",favorites.getFavoriteDishIds(user));
        String end=c.getDate(),start=MealConsumptionService.date(end).minusDays(6).toString();List<Map<String,Object>> recent=new ArrayList<>();
        for(MealConsumption meal:actual.range(user,start,end))if("eaten".equals(meal.getStatus())){Map<String,Object> item=new LinkedHashMap<>();item.put("date",meal.getMealDate());item.put("mealType",meal.getMealType());item.put("dishes",meal.getActualDishesJson());recent.add(item);}
        result.put("recentActual",recent);List<Map<String,Object>> savedMenus=new ArrayList<>();
        for(CustomRecipe menu:menus.list(user)){if(savedMenus.size()>=30)break;Map<String,Object> item=new LinkedHashMap<>();item.put("id",menu.getId());item.put("name",menu.getName());item.put("people",menu.getPeople());item.put("dishIds",menu.getDishIds());item.put("version",menu.getVersion());savedMenus.add(item);}
        result.put("menus",savedMenus);result.put("recommendationOptions",metadata.getOptions().getGroups());result.put("metadataVersion",metadata.getMetadataVersion());return result;
    }
    private Map<String,Object> readable(Dish d){
        Map<String,Object> value=new LinkedHashMap<>();value.put("id",d.getId());value.put("name",d.getName());value.put("type",d.getType());value.put("cuisineCode",d.getCuisineCode());value.put("tagCodes",d.getTagCodes());value.put("cookMinutes",d.getCookMinutes());value.put("steps",d.getSteps()==null?d.getStep():d.getSteps());value.put("methods",d.getMethods());value.put("contentVersion",d.getContentVersion());
        List<Map<String,Object>> facts=new ArrayList<>();List<String> names=new ArrayList<>();
        if(d.getQuality()!=null){for(CatalogQuality.Ingredient f:d.getQuality().getIngredients()){if("REJECTED".equals(f.getIdentityStatus()))continue;names.add(f.getName());Map<String,Object> item=new LinkedHashMap<>();item.put("name",f.getName());item.put("identityStatus",f.getIdentityStatus());boolean trusted="VERIFIED".equals(d.getQuality().getReviewStatus())&&f.verifiedQuantity();item.put("quantityValue",trusted?f.getQuantityValue():null);item.put("unit",f.getUnit());item.put("quantityStatus",trusted?"VERIFIED":"UNKNOWN");facts.add(item);}value.put("datasetVersion",d.getQuality().getDatasetVersion());}
        value.put("cl",names.isEmpty()?d.getCl():String.join(" ",names));value.put("ingredientFacts",facts);return value;
    }
}
