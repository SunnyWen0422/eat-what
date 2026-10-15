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
    @Autowired public AssistantGuidanceService(MealWorkspaceService w,AssistantV4Store s,ObjectMapper j,AssistantCapabilityService registry){this(w,s,j,registry,Clock.systemUTC());}
    AssistantGuidanceService(MealWorkspaceService w,AssistantV4Store s,ObjectMapper j,AssistantCapabilityService registry,Clock c){workspaces=w;store=s;json=j;clock=c;registry.registerUiFeature("clarification_v1");}
    public Card createClarification(String turnId,MealWorkspace w,String question){
        String kind,code;List<String> required;List<Map<String,Object>> options=new ArrayList<>();
        switch(question){
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
                    Map<String,Object> selection=json.convertValue(option.get("selection"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
                    if("target_date".equals(card.getData().get("questionCode"))&&"date".equals(choice.getOptionId())){if(choice.getDate()==null)throw new IllegalArgumentException();selection.put("date",MealConsumptionService.date(choice.getDate()).toString());}
                    else if(choice.getDate()!=null)throw new IllegalArgumentException();
                    TurnRequest original=json.readValue(parent.getInputJson(),TurnRequest.class);
                    return map("kind",card.getData().get("kind"),"originalIntent",original.getMessage(),"selection",selection);
                }
            }
        }catch(Exception invalid){throw conflict();}
        throw conflict();
    }
    private static void check(MealWorkspace w,Long r,Long p){AssistantV4ContextService.checkVersions(w,r,p);}
    static ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"这组选项已变化，请重新说明需求");}
}
