package com.eatwhat.service;

import com.eatwhat.dto.MealContext;
import com.eatwhat.dto.MenuWriteRequest;
import com.eatwhat.entity.CustomRecipe;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PersonalMenuService {
    private DishQualityService quality;
    @org.springframework.beans.factory.annotation.Autowired public void setQuality(DishQualityService q){quality=q;}
    private Dish enrich(Dish dish){return quality==null?dish:quality.enrich(dish);}
    private List<Dish> enrich(List<Dish> dishes){return quality==null?dishes:quality.enrich(dishes);}
    private final RecipeMapper menus;
    private final PersonalDishMapper dishes;
    private final MealConsumptionMapper locks;
    private final PersonalRecipeWrites writes;
    public PersonalMenuService(RecipeMapper menus,PersonalDishMapper dishes,MealConsumptionMapper locks,ObjectMapper json) {
        this.menus=menus; this.dishes=dishes; this.locks=locks; this.writes=new PersonalRecipeWrites(locks,json);
    }
    public List<CustomRecipe> list(Long user) { return menus.selectByUserId(user); }
    public CustomRecipe get(Long user,Long id) {
        CustomRecipe menu=menus.selectOwned(id,user);
        if(menu==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"菜单不存在或不可访问");
        return menu;
    }
    @Transactional
    public CustomRecipe save(Long user,Long id,MenuWriteRequest request) {
        if(request.getName()==null || request.getName().trim().isEmpty() || request.getName().trim().length()>100)throw new IllegalArgumentException("菜单名称应为 1 至 100 字");
        if(request.getPeople()==null || request.getPeople()<1 || request.getPeople()>50)throw new IllegalArgumentException("人数应为 1 至 50");
        List<Long> ids=request.getDishIds();
        if(ids==null || ids.isEmpty() || ids.size()>10 || ids.stream().anyMatch(v->v==null || v<1) || new HashSet<>(ids).size()!=ids.size())throw new IllegalArgumentException("菜单请选择 1 至 10 道不同的菜");
        String hash=writes.begin(user,request.getRequestId(),"menu:save:"+id,request);
        CustomRecipe replay=writes.replay(user,request.getRequestId(),hash,CustomRecipe.class);
        if(replay!=null)return replay;
        long version=id==null?0L:get(user,id).getVersion();
        expected(version,request.getExpectedVersion());
        List<Dish> snapshots=readCurrent(user,ids);
        if(request.getDishVersions()!=null)for(Dish d:snapshots) {
            String seen=request.getDishVersions().get(d.getId());
            if(seen!=null && !seen.equals(d.getContentVersion()))throw conflict("所选菜品已变化，请重新选择后保存菜单");
        }
        CustomRecipe menu=new CustomRecipe();menu.setId(id);menu.setUserId(user);menu.setName(request.getName().trim());menu.setMealType("dinner");menu.setPeople(request.getPeople());menu.setDishIds(ids);menu.setDishes(snapshots);menu.setVersion(version+1);
        if(id==null)menus.insert(menu);else if(menus.update(menu)!=1)throw conflict("菜单已变化，请重新读取");
        writes.save(user,request.getRequestId(),hash,menu);return menu;
    }
    @Transactional
    public Map<String,Object> delete(Long user,Long id,MenuWriteRequest request) {
        String hash=writes.begin(user,request.getRequestId(),"menu:delete:"+id,request);
        Map replay=writes.replay(user,request.getRequestId(),hash,Map.class);if(replay!=null)return replay;
        CustomRecipe current=get(user,id);expected(current.getVersion(),request.getExpectedVersion());
        if(menus.delete(id,user,current.getVersion())!=1)throw conflict("菜单已变化，请重新读取");
        Map<String,Object> result=Collections.singletonMap("success",true);writes.save(user,request.getRequestId(),hash,result);return result;
    }
    @Transactional
    public Map<String,Object> resolve(Long user,Long id,MenuWriteRequest request) {
        validateTarget(request.getDate(),request.getMealType());lock(user);
        CustomRecipe menu=validatedMenu(user,id,request.getExpectedVersion());
        Map<String,Object> result=new LinkedHashMap<>();result.put("menuId",id);result.put("menuVersion",menu.getVersion());result.put("menuDate",request.getDate());result.put("menuMealType",request.getMealType());result.put("people",menu.getPeople());result.put("dishIds",menu.getDishIds());return result;
    }
    /** Called on the actual server-generated selection, before it becomes a workspace draft. */
    @Transactional
    public void validateDraft(Long user,Long id,Long version,String date,String meal,MealContext context,List<Dish> generated) {
        validateTarget(date,meal);
        if(!Objects.equals(date,context.getDate()) || !Objects.equals(meal,context.getMealType()))throw new IllegalArgumentException("菜单目标餐次已变化，请重新选择");
        lock(user);CustomRecipe menu=validatedMenu(user,id,version);
        if(!Objects.equals(menu.getPeople(),context.getPeople()))throw new IllegalArgumentException("菜单人数已变化，请重新应用菜单");
        Set<Long> expectedIds=new HashSet<>(menu.getDishIds());
        if(generated==null || generated.size()!=expectedIds.size() || !expectedIds.equals(generated.stream().map(Dish::getId).collect(Collectors.toSet())))throw new IllegalArgumentException("菜单与草稿菜品不一致，请先解除原方案保留项再应用菜单");
        Map<Long,Dish> snapshots=menu.getDishes().stream().collect(Collectors.toMap(Dish::getId,d->d));
        for(Dish dish:generated)if(!snapshots.get(dish.getId()).getContentVersion().equals(dish.getContentVersion()))throw conflict("菜单菜品已变化，请重新编辑菜单后使用");
        // Existing workspace locks may prepend dishes; the saved menu's order remains authoritative.
        List<Long> savedOrder=menu.getDishIds();
        generated.sort(Comparator.comparingInt(d -> savedOrder.indexOf(d.getId())));
    }
    private CustomRecipe validatedMenu(Long user,Long id,Long version) {
        CustomRecipe menu=get(user,id);expected(menu.getVersion(),version);
        List<Dish> snapshot=menu.getDishes(), current=readCurrent(user,menu.getDishIds());
        if(snapshot.isEmpty() || snapshot.size()!=current.size())throw conflict("旧菜单需要重新编辑保存后才能使用");
        Map<Long,Dish> saved=snapshot.stream().collect(Collectors.toMap(Dish::getId,d->d));
        for(Dish dish:current)if(!saved.containsKey(dish.getId()) || !saved.get(dish.getId()).getContentVersion().equals(dish.getContentVersion()))throw conflict("菜单中的菜品已变化，请重新编辑保存菜单");
        return menu;
    }
    private List<Dish> readCurrent(Long user,List<Long> ids) {
        if(ids==null || ids.isEmpty() || ids.size()>10)throw conflict("菜单菜品无效，请重新编辑保存");
        Map<Long,Dish> current=new HashMap<>();
        // Fixed lock order avoids deadlocks for menus containing the same dishes in different orders.
        for(Long id:new TreeSet<>(ids)) { Dish dish=enrich(dishes.lockReadable(id,user));if(dish==null)throw conflict("菜单中的菜品已删除、下架或不可访问，请重新编辑菜单");current.put(id,dish); }
        return ids.stream().map(current::get).collect(Collectors.toList());
    }
    private void lock(Long user) { if(user==null || locks.lockUser(user)==null)throw new IllegalArgumentException("用户不存在"); }
    private void expected(long actual,Long expected) { if(expected==null || expected<0)throw new IllegalArgumentException("请提供菜单版本");if(actual!=expected)throw conflict("菜单已在另一处修改，请重新读取"); }
    private void validateTarget(String date,String meal) {
        try { if(date==null || !date.matches("\\d{4}-\\d{2}-\\d{2}"))throw new IllegalArgumentException(); LocalDate.parse(date); }
        catch(RuntimeException error) { throw new IllegalArgumentException("菜单目标日期无效"); }
        if(!Arrays.asList("breakfast","lunch","dinner").contains(meal))throw new IllegalArgumentException("菜单目标餐次无效");
    }
    private MealConsumptionService.VersionConflict conflict(String message) { return new MealConsumptionService.VersionConflict(message); }
}
