package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import static com.eatwhat.service.AssistantV4ContextService.map;

/** Choices carry server facts, never business-write approval or model supplied targets. */
@Service
public class AssistantGuidanceService {
    private final MealWorkspaceService workspaces;private final AssistantV4Store store;private final ObjectMapper json;private final Clock clock;
    private final AssistantCapabilityService registry;
    private DishQueryService dishes;private PersonalMenuService menus;private FavoriteDishService favorites;private ShoppingListService shopping;private MealConsumptionService meals;private UserPreferenceService preferences;
    @Autowired public AssistantGuidanceService(MealWorkspaceService w,AssistantV4Store s,ObjectMapper j,AssistantCapabilityService registry){this(w,s,j,registry,Clock.systemUTC());}
    AssistantGuidanceService(MealWorkspaceService w,AssistantV4Store s,ObjectMapper j,AssistantCapabilityService registry,Clock c){workspaces=w;store=s;json=j;clock=c;this.registry=registry;registry.registerUiFeature("clarification_v1");registry.registerUiFeature("meal_requirements_v1");}
    @Autowired void setupNavigation(DishQueryService d,PersonalMenuService m,FavoriteDishService f,ShoppingListService sh,MealConsumptionService actual,UserPreferenceService p){dishes=d;menus=m;favorites=f;shopping=sh;meals=actual;preferences=p;registry.registerUiFeature("handoff_v1");}
    public Card createClarification(String turnId,MealWorkspace w,String question){
        String kind,code;List<String> required;List<Map<String,Object>> options=new ArrayList<>();
        switch(question){
            case "这餐想优先调整什么？":
                kind="meal_requirement";code="meal_requirement";required=Collections.singletonList("requirementMode");
                options.add(option("time","限制每道菜用时",map("requirementMode","time")));
                options.add(option("ingredients","补充本餐忌口",map("requirementMode","ingredients")));
                options.add(option("keep","先保持当前菜单",map("requirementMode","keep")));break;

            case "请说明目标日期。":
                kind="meal_target";code="target_date";required=Collections.singletonList("date");LocalDate today=LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai")));
                options.add(option("today","今天",map("date",today.toString())));options.add(option("tomorrow","明天",map("date",today.plusDays(1).toString())));options.add(option("date","选择日期",Collections.emptyMap()));break;
            case "请说明目标餐次：早餐、午餐或晚餐。":
                kind="meal_target";code="target_meal";required=Collections.singletonList("mealType");
                String[] labels={"早餐","午餐","晚餐"};int i=0;for(String meal:Arrays.asList("breakfast","lunch","dinner"))options.add(option(meal,labels[i++],map("mealType",meal)));break;
            case "这餐安排几个人用餐？":
                kind="missing_people";code="people";required=Collections.singletonList("people");for(int n=1;n<=4;n++)options.add(option("p"+n,n+"人",map("people",n)));break;
            case "请说明要查询或调整哪道菜。":
                kind="dish_reference";code="dish";required=Collections.singletonList("dishId");
                for(Dish d:w.getDraft().getDishes()){if(options.size()==4)break;options.add(option("d"+d.getId(),d.getName(),map("dishId",d.getId())));}break;
            case "请说明使用当前餐还是已有的日历安排。":
                kind="source_choice";code="source";required=Collections.singletonList("source");
                options.add(option("draft","当前餐",map("source","draft")));options.add(option("calendar","日历安排",map("source","calendar")));break;
            default:return null;
        }
        Card card=new Card();card.setId("guidance-"+turnId);card.setType("clarification");card.setTitle(question);card.setExpiresAt(clock.millis()+600000);
        WorkspaceRef ref=new WorkspaceRef();ref.setWorkspaceId(w.getId());ref.setWorkspaceRevision(w.getRevision());ref.setPlanVersion(w.getDraft().getPlanVersion());card.setWorkspaceRef(ref);
        card.setData(map("kind",kind,"questionCode",code,"requiredFields",required,"authorizedOptions",options,"continuationRef",turnId));return card;
    }
    private Map<String,Object> option(String id,String label,Map<String,Object> selection){return map("id",id,"label",label,"selection",selection);}
    public MealWorkspace currentWorkspace(Long user,TurnRequest request){MealWorkspace w=workspaces.get(user,request.getWorkspaceId());AssistantV4ContextService.checkVersions(w,request.getExpectedWorkspaceRevision(),request.getExpectedPlanVersion());return w;}
    public Card resolveNavigation(Long user,Map<String,Object> intent,TurnScope scope,String userText){
        if(user==null||user<1||scope==null||!Objects.equals(user,scope.getUserId())||intent==null)throw new IllegalArgumentException("交接范围无效");
        AssistantV4Contract.fields(json.valueToTree(intent),"kind","ref","target","userText");
        String kind=intent.get("kind") instanceof String?(String)intent.get("kind"):"";if(!AssistantV4Contract.HANDOFFS.contains(kind))throw new IllegalArgumentException("交接类型无效");
        MealWorkspace w=workspaces.get(user,scope.getWorkspaceId());AssistantV4ContextService.checkVersions(w,scope.getExpectedWorkspaceRevision(),scope.getExpectedPlanVersion());
        Map<String,Object> ref=mapValue(intent.get("ref")),target=mapValue(intent.get("target"));Map<String,Object> authorized=new LinkedHashMap<>();String version;
        if(Arrays.asList("record_actual","use_personal_menu").contains(kind)){
            if(!target.containsKey("date"))return createClarification(scope.getTurnId(),w,"请说明目标日期。");
            if(!target.containsKey("mealType"))return createClarification(scope.getTurnId(),w,"请说明目标餐次：早餐、午餐或晚餐。");
            AssistantV4Contract.fields(json.valueToTree(target),"date","mealType");MealConsumptionService.date(String.valueOf(target.get("date")));
            if(!Arrays.asList("breakfast","lunch","dinner").contains(target.get("mealType")))throw new IllegalArgumentException("餐次无效");
        }else if(!target.isEmpty())throw new IllegalArgumentException("交接目标无效");
        switch(kind){
            case "copy_recipe":case "view_favorite":{
                AssistantV4Contract.fields(json.valueToTree(ref),"dishId");Long id=numericId(ref.get("dishId"));
                if(!scope.getAuthorizedDishIds().contains(id))throw new IllegalArgumentException("请先查询需要查看的菜品");
                if("view_favorite".equals(kind)&&!favorites.getFavoriteDishIds(user).contains(id))throw new IllegalArgumentException("收藏已变化");
                List<Dish> found=dishes.getDishesByIdsForUser(Collections.singletonList(id),user);if(found==null||found.size()!=1||!id.equals(found.get(0).getId()))throw new IllegalArgumentException("菜谱不可访问");
                Dish dish=found.get(0);AssistantV4ContextService.checkDish(dish,user);authorized.put("dishId",id);version=dish.getContentVersion();break;
            }
            case "use_personal_menu":{
                AssistantV4Contract.fields(json.valueToTree(ref),"menuId");Long id=numericId(ref.get("menuId"));com.eatwhat.entity.CustomRecipe menu=menus.get(user,id);
                if(menu==null||!Objects.equals(user,menu.getUserId()))throw new IllegalArgumentException("菜单不可访问");authorized.put("menuId",id);version=String.valueOf(menu.getVersion());break;
            }
            case "save_personal_menu":{
                AssistantV4Contract.fields(json.valueToTree(ref),"workspaceId");if(!Objects.equals(w.getId(),ref.get("workspaceId"))||w.getDraft().getDishes().isEmpty())throw new IllegalArgumentException("请先准备本餐菜单");
                authorized.put("workspaceId",w.getId());target=map("date",w.getContext().getDate(),"mealType",w.getContext().getMealType());version=w.getRevision()+":"+w.getDraft().getPlanVersion();break;
            }
            case "edit_shopping":{
                AssistantV4Contract.fields(json.valueToTree(ref),"itemId");Long id=numericId(ref.get("itemId"));ShoppingListResponse list=shopping.getList(user,"all");boolean found=false;
                for(ShoppingDishDTO group:list.getDishes())for(ShoppingPreviewItemDTO item:group.getItems())if(id.equals(item.getId()))found=true;
                if(!found)throw new IllegalArgumentException("采购条目已变化");authorized.put("itemId",id);version=String.valueOf(list.getVersion());break;
            }
            case "edit_preferences":AssistantV4Contract.fields(json.valueToTree(ref));version=hash(preferences.get(user));break;
            case "record_actual":AssistantV4Contract.fields(json.valueToTree(ref));version=hash(meals.overview(user,String.valueOf(target.get("date")),String.valueOf(target.get("date"))));break;
            default:throw new IllegalArgumentException("交接类型无效");
        }
        Card card=new Card();card.setId("handoff-"+scope.getTurnId());card.setType("handoff");card.setTitle(navigationLabel(kind));card.setText("请在打开的页面核对并保存");card.setExpiresAt(clock.millis()+600000);
        WorkspaceRef workspaceRef=new WorkspaceRef();workspaceRef.setWorkspaceId(w.getId());workspaceRef.setWorkspaceRevision(w.getRevision());workspaceRef.setPlanVersion(w.getDraft().getPlanVersion());card.setWorkspaceRef(workspaceRef);
        Map<String,Object> payload=map("kind",kind,"ref",authorized,"prefill",map("userText",userText==null?"":userText));
        if(version!=null)payload.put("sourceVersion",version);if(!target.isEmpty())payload.put("target",target);card.setData(payload);return card;
    }
    static String navigationLabel(String kind){switch(kind){case "record_actual":return "查看或修改餐次记录";case "edit_preferences":return "去编辑长期偏好";case "edit_shopping":return "去调整采购条目";case "copy_recipe":return "去编辑菜谱副本";case "save_personal_menu":return "存为常用菜单";case "use_personal_menu":return "查看并用于本餐";case "view_favorite":return "查看收藏菜谱";default:return "请明确要操作的内容";}}
    @SuppressWarnings("unchecked") private Map<String,Object> mapValue(Object value){if(value==null)return Collections.emptyMap();if(!(value instanceof Map))throw new IllegalArgumentException("交接引用无效");return (Map<String,Object>)value;}
    private Long numericId(Object value){if(!(value instanceof Integer||value instanceof Long)||((Number)value).longValue()<1)throw new IllegalArgumentException("交接编号无效");return ((Number)value).longValue();}
    private String hash(Object value){try{return com.eatwhat.util.WorkflowRequestHash.sha256(json.writeValueAsString(value));}catch(Exception e){throw new IllegalStateException("交接内容不可读取");}}
    public Map<String,Object> resolveChoice(Long user,String sessionId,TurnRequest request){
        if(request.getClarificationChoice()==null)return null;
        TurnRecord parent=store.turnRecord(user,request.getClarificationChoice().getContinuationRef());
        MealWorkspace w=workspaces.get(user,request.getWorkspaceId());
        return validateChoice(user,sessionId,request,parent,w,json,clock.millis(),true);
    }
    /** Pure validation is also used under the user's database lock at claim time. */
    static Map<String,Object> validateChoice(Long user,String sessionId,TurnRequest request,TurnRecord parent,MealWorkspace w,ObjectMapper json,long now,boolean consumed){
        try{
            ClarificationChoice choice=request.getClarificationChoice();
            if(choice==null||request.getUiFeatures()==null||!request.getUiFeatures().contains("clarification_v1")||parent==null||!Objects.equals(parent.getUserId(),user)||!Objects.equals(parent.getSessionId(),sessionId)||!Objects.equals(parent.getWorkspaceId(),request.getWorkspaceId())||!"needs_input".equals(parent.getStatus()))throw new IllegalArgumentException();
            check(w,request.getExpectedWorkspaceRevision(),request.getExpectedPlanVersion());
            TurnResult result=json.readValue(parent.getResultJson(),TurnResult.class);
            for(Card card:result.getCards())if("clarification".equals(card.getType())&&Objects.equals(choice.getContinuationRef(),card.getData().get("continuationRef"))){
                WorkspaceRef ref=card.getWorkspaceRef();if(ref==null||!Objects.equals(w.getId(),ref.getWorkspaceId()))throw new IllegalArgumentException();check(w,ref.getWorkspaceRevision(),ref.getPlanVersion());
                Object claimed=card.getData().get("consumedByRequestId");if(card.getExpiresAt()==null||card.getExpiresAt()<=now||(consumed?!Objects.equals(claimed,request.getRequestId()):claimed!=null))throw new IllegalArgumentException();
                Object raw=card.getData().get("authorizedOptions");if(!(raw instanceof List))throw new IllegalArgumentException();
                for(Object o:(List<?>)raw){if(!(o instanceof Map))continue;Map<?,?> option=(Map<?,?>)o;if(!Objects.equals(choice.getOptionId(),option.get("id")))continue;
                    Map<String,Object> selection=new LinkedHashMap<>();
                    Object prior=card.getData().get("priorSelection");if(prior instanceof Map)selection.putAll(json.convertValue(prior,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){}));
                    selection.putAll(json.convertValue(option.get("selection"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){}));
                    if("target_date".equals(card.getData().get("questionCode"))&&"date".equals(choice.getOptionId())){if(choice.getDate()==null)throw new IllegalArgumentException();selection.put("date",MealConsumptionService.date(choice.getDate()).toString());}
                    else if(choice.getDate()!=null)throw new IllegalArgumentException();
                    TurnRequest original=json.readValue(parent.getInputJson(),TurnRequest.class);
                    Object root=card.getData().get("originalIntent");
                    String originalIntent=root instanceof String&&((String)root).length()<=2000?(String)root:original.getMessage();
                    return map("kind",card.getData().get("kind"),"originalIntent",originalIntent,"selection",selection);
                }
            }
        }catch(Exception invalid){throw conflict();}
        throw conflict();
    }
    private static void check(MealWorkspace w,Long r,Long p){AssistantV4ContextService.checkVersions(w,r,p);}
    static ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"这组选项已变化，请重新说明需求");}
}
