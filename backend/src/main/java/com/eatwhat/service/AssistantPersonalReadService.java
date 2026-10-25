package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import java.util.*;
import static com.eatwhat.service.AssistantV4ContextService.*;

/** Owner-scoped reads. These tools cannot create, resolve, or overwrite a meal. */
@Service
public class AssistantPersonalReadService {
    public static final Set<String> READS=Collections.unmodifiableSet(new HashSet<>(Arrays.asList("get_recommendation_options","read_favorites","read_saved_menus")));
    private static final List<String> GROUPS=Arrays.asList("cuisine","flavor","scene","diet","method");
    private final MealWorkspaceService workspaces;private final FavoriteDishService favorites;
    private final PersonalMenuService menus;private final DishQueryService dishes;
    private final RecommendationMetadataService metadata;private final ObjectMapper json;
    public AssistantPersonalReadService(MealWorkspaceService w,FavoriteDishService f,PersonalMenuService m,DishQueryService d,RecommendationMetadataService meta,ObjectMapper j,AssistantCapabilityService registry){
        workspaces=w;favorites=f;menus=m;dishes=d;metadata=meta;json=j;
        for(String name:READS)registry.registerRead(name,this::read);
    }
    public ReadResult read(Long user,ToolRead call,TurnScope scope){
        if(user==null||scope==null||!Objects.equals(user,scope.getUserId())||call==null||!READS.contains(call.getName()))throw new IllegalArgumentException("查询范围无效");
        checkVersions(workspaces.get(user,scope.getWorkspaceId()),scope.getExpectedWorkspaceRevision(),scope.getExpectedPlanVersion());
        Map<String,Object> args=call.getArguments();if(args==null)throw new IllegalArgumentException("查询参数无效");
        ReadResult result=new ReadResult();result.setCallId(call.getCallId());result.setName(call.getName());
        if("get_recommendation_options".equals(call.getName())){
            fields(args,"group");String group=text(args,"group",40);
            if(group!=null&&!GROUPS.contains(group))throw new IllegalArgumentException("筛选分类无效");
            RecommendationOptionsDTO options=metadata.getDefinitions();
            for(String key:GROUPS)if(group==null||key.equals(group)){
                if(group==null){result.getItems().add(map("group",key));continue;}
                for(RecommendationOptionsDTO.Option o:orEmpty(options.getGroups().get(key))){
                    if(result.getItems().size()==30){result.setTruncated(true);break;}
                    result.getItems().add(map("group",key,"code",o.getCode(),"label",o.getLabel(),"kind",o.getKind()));
                }
            }
            result.setSourceVersion(String.valueOf(options.getMetadataVersion()));return budget(result);
        }
        fields(args,"query","menuId","cursor","limit");
        if("read_favorites".equals(call.getName())&&args.containsKey("menuId"))throw new IllegalArgumentException("查询字段无效");
        String query=text(args,"query",200),cursor=text(args,"cursor",19);long after=cursor==null?0:id(cursor);int limit=limit(args);
        if("read_favorites".equals(call.getName())){
            TreeSet<Long> ids=new TreeSet<>(orEmpty(favorites.getFavoriteDishIds(user)));
            List<Long> page=new ArrayList<>();
            for(Long candidate:ids)if(candidate!=null&&candidate>after)page.add(candidate);
            // Fetch in bounded batches, including enough matching rows for a reliable next cursor.
            outer:for(int start=0;start<page.size();start+=100){
                Map<Long,Dish> byId=new HashMap<>();
                for(Dish d:orEmpty(dishes.getDishesByIdsForUser(page.subList(start,Math.min(start+100,page.size())),user))){checkDish(d,user);if(ids.contains(d.getId()))byId.put(d.getId(),d);}
                for(Long key:page.subList(start,Math.min(start+100,page.size()))){Dish d=byId.get(key);if(d==null||!matches(d.getName(),query))continue;
                    if(result.getItems().size()==limit){result.setTruncated(true);break outer;}
                    Map<String,Object> item=CanonicalAssistantFacts.summary(d);result.getItems().add(item);
                }
            }
        }else{
            List<CustomRecipe> source=args.containsKey("menuId")?Collections.singletonList(menus.get(user,id(args.get("menuId")))):orEmpty(menus.list(user));
            source=new ArrayList<>(source);source.sort(Comparator.comparing(CustomRecipe::getId));
            for(CustomRecipe m:source){
                if(m==null||!Objects.equals(user,m.getUserId()))throw new IllegalArgumentException("菜单不可访问");
                if(m.getId()<=after||!matches(m.getName(),query))continue;
                if(result.getItems().size()==limit){result.setTruncated(true);break;}
                result.getItems().add(map("kind","menu","id",m.getId(),"name",m.getName(),"people",m.getPeople(),"dishIds",m.getDishIds(),"version",m.getVersion()));
            }
        }
        result=budget(result);
        if(result.isTruncated()&&!result.getItems().isEmpty())result.setNextCursor(String.valueOf(result.getItems().get(result.getItems().size()-1).get("id")));
        result.setSourceVersion(com.eatwhat.util.WorkflowRequestHash.sha256(encode(result.getItems())));
        return result;
    }
    private ReadResult budget(ReadResult result){
        while(encode(result).length()>3800&&!result.getItems().isEmpty()){result.getItems().remove(result.getItems().size()-1);result.setTruncated(true);}
        return result;
    }
    private String encode(Object v){try{return json.writeValueAsString(v);}catch(Exception e){throw new IllegalStateException("查询结果不可读取");}}
    private static boolean matches(String name,String q){return q==null||(name!=null&&name.toLowerCase(Locale.ROOT).contains(q.toLowerCase(Locale.ROOT)));}
    private static void fields(Map<String,Object> a,String... keys){if(!new HashSet<>(Arrays.asList(keys)).containsAll(a.keySet()))throw new IllegalArgumentException("查询字段无效");}
    private static String text(Map<String,Object> a,String key,int max){if(!a.containsKey(key))return null;Object v=a.get(key);if(!(v instanceof String)||((String)v).trim().isEmpty()||((String)v).length()>max)throw new IllegalArgumentException("查询字段无效");return ((String)v).trim();}
    private static long id(Object v){try{if(!(v instanceof Integer||v instanceof Long||v instanceof String)||!v.toString().matches("[1-9][0-9]{0,18}"))throw new IllegalArgumentException();return Long.parseLong(v.toString());}catch(Exception e){throw new IllegalArgumentException("查询编号无效");}}
    private static int limit(Map<String,Object> a){Object v=a.getOrDefault("limit",20);if(!(v instanceof Integer||v instanceof Long)||((Number)v).longValue()<1||((Number)v).longValue()>20)throw new IllegalArgumentException("分页数量无效");return ((Number)v).intValue();}
}
