package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

/** Explicit model view; never serialize a workspace, domain entity, or provider frame wholesale. */
@Service
public class AssistantV4ContextService {
    static final int CONTEXT_BUDGET=6000;
    static final List<String> TYPES=Collections.unmodifiableList(Arrays.asList("meat","veg","soup","staple","dessert","side"));
    private final MealWorkspaceService workspaces;private final UserPreferenceService preferences;private final MealConsumptionMapper actual;
    private final PersonalMenuService menus;private final RecommendationMetadataService metadata;private final ObjectMapper json;private final Clock clock;
    @Autowired public AssistantV4ContextService(MealWorkspaceService w,UserPreferenceService p,MealConsumptionMapper a,PersonalMenuService m,RecommendationMetadataService d,ObjectMapper j){this(w,p,a,m,d,j,Clock.system(ZoneId.of("Asia/Shanghai")));}
    AssistantV4ContextService(MealWorkspaceService w,UserPreferenceService p,MealConsumptionMapper a,PersonalMenuService m,RecommendationMetadataService d,ObjectMapper j,Clock c){workspaces=w;preferences=p;actual=a;menus=m;metadata=d;json=j;clock=c;}
    public ModelContext build(Long user,TurnRequest request,SessionState session){
        if(user==null||user<1||request==null||session==null||!Objects.equals(user,session.getUserId())||!Objects.equals(request.getWorkspaceId(),session.getWorkspaceId()))throw new IllegalArgumentException("会话与本餐不匹配，请重新打开助手");
        MealWorkspace w=workspaces.get(user,request.getWorkspaceId());checkVersions(w,request.getExpectedWorkspaceRevision(),request.getExpectedPlanVersion());
        MealContext meal=w.getContext();UserPreferenceDTO saved=preferences.get(user);EffectiveRecommendationCriteria effective=new RecommendationCriteriaResolver().resolve(meal.getCriteria(),saved,true);
        LocalDate today=LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai"))),start=today.minusDays(6);ModelContext result=new ModelContext();
        result.setRequestContext(map("entryScene",request.getEntryScene(),"locale","zh-CN","timezone","Asia/Shanghai","now",OffsetDateTime.now(clock.withZone(ZoneId.of("Asia/Shanghai"))).toString(),"selectedTarget",map("date",meal.getDate(),"mealType",meal.getMealType())));
        result.setActiveMeal(activeMeal(w,user));result.setConstraints(map("hard",criteria(effective),"requirements",meal.getRequirements(),"ownedIngredients",meal.getOwnedIngredients()));
        result.setCapabilities(new ArrayList<>(AssistantReadToolService.READS));result.setEvidence(map("metadataVersion",metadata.getMetadataVersion(),"supportedTypes",TYPES,"recentActualRange",map("startDate",start.toString(),"endDate",today.toString()),"truncated",false,"detailsOnDemand",true));
        // IDs/order/locks and restrictions are mandatory. Reject if these alone cannot fit.
        if(size(result)>CONTEXT_BUDGET)throw new IllegalArgumentException("本餐条件内容过多，请精简文字或忌口后重试");
        List<Map<String,Object>> frames=new ArrayList<>();List<Message> messages=session.getMessages()==null?Collections.emptyList():session.getMessages();
        if(messages.size()>12)result.getEvidence().put("truncated",true);
        for(int i=Math.max(0,messages.size()-12);i<messages.size();i++){Message m=messages.get(i);if(m!=null&&Arrays.asList("user","assistant").contains(m.getRole())&&m.getText()!=null){frames.add(map("role",m.getRole(),"text",bounded(m.getText(),400)));if(m.getText().length()>400)result.getEvidence().put("truncated",true);}if(m!=null&&"assistant".equals(m.getRole()))for(Card card:orEmpty(m.getCards())){Map<String,Object> action=actionSummary(card);if(action!=null)result.getLastActions().add(action);}}
        // Receipts recur in each continuation/repreview message. Keep each fact once,
        // ordered by its latest occurrence, while retaining every current pending action.
        LinkedHashMap<String,Map<String,Object>> actions=new LinkedHashMap<>();
        for(Map<String,Object> action:result.getLastActions()){
            String key=action.get("receiptRef")!=null?"receipt:"+action.get("receiptRef"):"task:"+action.get("taskId");
            if(actions.remove(key)!=null)result.getEvidence().put("truncated",true);
            actions.put(key,action);
        }
        result.setLastActions(new ArrayList<>(actions.values()));
        result.setConversation(map("recentText",frames,"roundLimit",6));
        List<Map<String,Object>> recent=new ArrayList<>();for(MealConsumption row:orEmpty(actual.range(user,start.toString(),today.toString()))){if(row==null||!"eaten".equals(row.getStatus())||row.getMealDate()==null||MealConsumptionService.date(row.getMealDate()).isAfter(today)||MealConsumptionService.date(row.getMealDate()).isBefore(start))continue;if(row.getUserId()!=null&&!Objects.equals(user,row.getUserId()))throw new IllegalArgumentException("用餐记录不可访问");recent.add(actual(row,json));}
        result.setRecentActual(recent);
        // Preserve explicitly named saved-menu references, and only compact optional menu summaries.
        List<Map<String,Object>> optionalMenus=new ArrayList<>();for(CustomRecipe menu:orEmpty(menus.list(user))){if(menu.getUserId()!=null&&!Objects.equals(user,menu.getUserId()))throw new IllegalArgumentException("菜单不可访问");Map<String,Object> item=map("kind","menu","id",menu.getId(),"name",menu.getName(),"people",menu.getPeople(),"dishIds",menu.getDishIds(),"version",menu.getVersion());if(menu.getName()!=null&&!menu.getName().isEmpty()&&request.getMessage()!=null&&request.getMessage().contains(menu.getName()))result.getReferences().add(item);else if(optionalMenus.size()<5)optionalMenus.add(item);}
        result.getConversation().put("savedMenus",optionalMenus);
        result.getConstraints().put("soft",map("preferredCuisineCodes",effective.getPreferredCuisineCodes(),"preferredTagCodes",effective.getPreferredTagCodes(),"avoidRecentDays",effective.getAvoidRecentDays()));
        // Structured optional removal retains the mandatory current meal, named refs, and constraints.
        while(size(result)>CONTEXT_BUDGET){
            result.getEvidence().put("truncated",true);
            if(!optionalMenus.isEmpty())optionalMenus.remove(optionalMenus.size()-1);
            else if(!frames.isEmpty())frames.remove(0);
            else if(!recent.isEmpty())recent.remove(0);
            else if(result.getConstraints().containsKey("soft"))result.getConstraints().remove("soft");
            else if(!trimOldCompletedAction(result.getLastActions()))throw new IllegalArgumentException("本餐与点名菜单内容过多，请缩小查询范围后重试");
        }
        return result;
    }
    private static boolean trimOldCompletedAction(List<Map<String,Object>> actions){
        for(Iterator<Map<String,Object>> it=actions.iterator();it.hasNext();)if("completed".equals(it.next().get("outcome"))){it.remove();return true;}
        return false;
    }
    static void checkVersions(MealWorkspace w,Long revision,Long plan){if(w==null||w.getDraft()==null||w.getContext()==null)throw new IllegalArgumentException("本餐不可访问");if(revision==null||plan==null||!Objects.equals(w.getRevision(),revision)||!Objects.equals(w.getDraft().getPlanVersion(),plan))throw new MealConsumptionService.VersionConflict("本餐已更新，请查看最新菜单后重试");}
    static Map<String,Object> activeMeal(MealWorkspace w,Long user){List<Map<String,Object>> list=new ArrayList<>();Set<Long> ids=new HashSet<>();for(Dish d:w.getDraft().getDishes()){checkDish(d,user);list.add(dishSummary(d));ids.add(d.getId());}if(!ids.containsAll(w.getDraft().getLockedDishIds()))throw new IllegalArgumentException("保留菜品不在本餐中，请核对菜单");MealContext c=w.getContext();return map("workspaceId",w.getId(),"workspaceRevision",w.getRevision(),"planVersion",w.getDraft().getPlanVersion(),"date",c.getDate(),"mealType",c.getMealType(),"people",c.getPeople(),"compositionMode",c.getCompositionMode(),"counts",c.getCounts(),"totalCookMinutes",c.getTotalCookMinutes(),"currentDishes",list,"lockedDishIds",new ArrayList<>(w.getDraft().getLockedDishIds()),"source",w.getDraft().getSource());}
    static void checkDish(Dish d,Long user){if(d==null||d.getId()==null||(d.getUserId()!=null&&!Objects.equals(d.getUserId(),user)))throw new IllegalArgumentException("菜品不存在或不可访问");}
    static Map<String,Object> dishSummary(Dish d){return map("id",d.getId(),"name",d.getName(),"type",d.getType(),"cuisineCode",d.getCuisineCode(),"tagCodes",d.getTagCodes(),"cookMinutes",d.getCookMinutes(),"contentVersion",d.getContentVersion());}
    static Map<String,Object> criteria(RecommendationCriteria c){return map("cuisineCodes",c.getCuisineCodes(),"includeTagCodes",c.getIncludeTagCodes(),"excludeTagCodes",c.getExcludeTagCodes(),"excludedIngredients",c.getExcludedIngredients(),"maxCookMinutes",c.getMaxCookMinutes());}
    static Map<String,Object> actual(MealConsumption row,ObjectMapper json){List<Map<String,Object>> dishes=new ArrayList<>();List<Map<String,Object>> entries=row.getActualDishes();if(entries==null&&row.getActualDishesJson()!=null)try{entries=json.readValue(row.getActualDishesJson(),new TypeReference<List<Map<String,Object>>>(){});}catch(Exception ex){throw new IllegalStateException("实际用餐记录无法读取",ex);}for(Map<String,Object> e:orEmpty(entries)){dishes.add(map("dishId",scalar(e.get("dishId")),"name",scalar(e.get("name")),"type",scalar(e.get("type"))));if(dishes.size()==30)break;}return map("date",row.getMealDate(),"mealType",row.getMealType(),"status",row.getStatus(),"revision",row.getRevision(),"dishes",dishes,"basis","explicit_eaten");}
    private static Object scalar(Object value){return value==null||value instanceof String||value instanceof Number||value instanceof Boolean?value:null;}
    /** Persisted assistant cards are produced by authenticated domain adapters, never model output. */
    private static Map<String,Object> actionSummary(Card card){
        if(card==null||!Arrays.asList("calendar_save","shopping_preview","receipt").contains(card.getType()))return null;
        String task=stringFact(card.getTaskId(),100),receipt=stringFact(card.getReceiptRef(),100);
        if(task==null&&receipt==null)return null;
        Map<String,Object> data=card.getData()==null?Collections.emptyMap():card.getData();WorkspaceRef ref=card.getWorkspaceRef();
        String day=stringFact(data.get("date"),10);if(day!=null)try{if(day.length()!=10||!LocalDate.parse(day).toString().equals(day))day=null;}catch(Exception invalid){day=null;}
        String meal=stringFact(data.get("mealType"),20);if(!Arrays.asList("breakfast","lunch","dinner").contains(meal))meal=null;
        Map<String,Object> target=map("date",day,"mealType",meal,"planRevision",numberFact(data.get("planRevision"),0,Long.MAX_VALUE),
            "workspaceId",stringFact(ref==null?data.get("workspaceId"):ref.getWorkspaceId(),100),
            "workspaceRevision",numberFact(ref==null?data.get("workspaceRevision"):ref.getWorkspaceRevision(),0,Long.MAX_VALUE),
            "planVersion",numberFact(ref==null?data.get("planVersion"):ref.getPlanVersion(),0,Long.MAX_VALUE),"people",numberFact(data.get("people"),1,50));
        return map("type",card.getType(),"taskId",task,"title",stringFact(card.getTitle(),200),"expiresAt",numberFact(card.getExpiresAt(),0,Long.MAX_VALUE),
            "receiptRef",receipt,"outcome",receipt==null?"awaiting_confirmation":"completed","target",target);
    }
    private static String stringFact(Object value,int limit){return value instanceof String&&!((String)value).trim().isEmpty()&&((String)value).length()<=limit?(String)value:null;}
    private static Object numberFact(Object value,long min,long max){if(!(value instanceof Integer||value instanceof Long))return null;long n=((Number)value).longValue();return n>=min&&n<=max?value:null;}
    static Map<String,Object> map(Object... values){Map<String,Object> out=new LinkedHashMap<>();for(int i=0;i<values.length;i+=2)out.put((String)values[i],values[i+1]);return out;}
    static <T> List<T> orEmpty(List<T> list){return list==null?Collections.emptyList():list;}
    private static String bounded(String s,int limit){return s.length()<=limit?s:s.substring(0,limit);}
    private int size(Object value){try{return json.writeValueAsString(value).length();}catch(Exception ex){throw new IllegalStateException("助手上下文无法读取",ex);}}
}
