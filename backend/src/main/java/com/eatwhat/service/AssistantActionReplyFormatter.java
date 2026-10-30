package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import java.time.LocalDate;
import java.util.*;

/** Successful action prose comes only from completed steps and their domain receipts. */
final class AssistantActionReplyFormatter {
    static String completed(WorkflowContinuation workflow,List<Card> cards,Map<String,Object> previousMeal) {
        List<String> replies=new ArrayList<>();
        for(WorkflowStep step:workflow.getSteps()) {
            if(!"completed".equals(step.getStatus())||step.getReceiptRef()==null||step.getReceiptRef().trim().isEmpty())continue;
            Card receipt=null;
            for(Card card:cards)if(step.getReceiptRef().equals(card.getReceiptRef()))receipt=card;
            Map<String,Object> actual=receipt==null||receipt.getData()==null?Collections.emptyMap():receipt.getData();
            if("draft_update".equals(step.getKind()))replies.add(menu(step,actual,previousMeal));
            else if("calendar_save".equals(step.getKind()))replies.add(calendar(actual));
            else if("shopping_preview".equals(step.getKind()))replies.add("已加入采购清单");
        }
        if(replies.isEmpty())return workflow.getCursor()<workflow.getSteps().size()?"正在准备下一步":"操作结果待核对";
        String result=String.join("；",replies);
        return result+(workflow.getCursor()<workflow.getSteps().size()?"，正在准备下一步":"");
    }

    private static String menu(WorkflowStep step,Map<String,Object> actual,Map<String,Object> previous) {
        List<Long> after=ids(actual.get("dishes")),before=ids(previous.get("currentDishes"));
        if("menu_undo".equals(actual.get("changeKind")))return "已恢复上一版菜单";
        if("configuration".equals(actual.get("changeKind"))){
            Map<?,?> patch=step.getArguments().get("contextPatch") instanceof Map?(Map<?,?>)step.getArguments().get("contextPatch"):Collections.emptyMap();Integer people=people(actual.get("people"));
            if(patch.containsKey("people")&&people!=null)return "已改为"+people+"人分食，菜品未变";
            return after!=null&&!after.isEmpty()?"下次搭配条件已更新，当前菜品未变":"本餐设置已更新";
        }
        if(after==null||after.isEmpty())return "已更新本餐";
        String meal=meal(actual.get("mealType"));
        Object operation=step.getArguments().get("operation");
        if("generate".equals(operation)||"regenerate".equals(operation))
            return ("regenerate".equals(operation)&&before!=null&&!before.equals(after)?"已换好一套":"已安排好")+(meal.isEmpty()?"这餐":meal)+"，共"+after.size()+"道菜";
        Map<?,?> patch=step.getArguments().get("contextPatch") instanceof Map?(Map<?,?>)step.getArguments().get("contextPatch"):Collections.emptyMap();
        Integer people=people(actual.get("people"));
        if(patch.containsKey("people")&&people!=null)
            return before!=null&&before.equals(after)?"已改为"+people+"人分食，菜品未变":"本餐现为"+people+"人分食，共"+after.size()+"道菜";
        Object target=step.getArguments().get("targetDishId");
        if(target instanceof Number&&before!=null&&before.size()==after.size()) {
            int changed=-1;
            for(int i=0;i<before.size();i++)if(!before.get(i).equals(after.get(i))){if(changed>=0){changed=-2;break;}changed=i;}
            if(changed>=0&&before.get(changed).longValue()==((Number)target).longValue()&&!after.contains(before.get(changed))) {
                String oldType=type(previous.get("currentDishes"),changed),newType=type(actual.get("dishes"),changed);
                String label=oldType.equals(newType)?dishType(oldType):"这道菜";
                return "已换好"+label+(after.size()>1?"，其余菜品未变":"");
            }
        }
        if(before!=null&&before.equals(after))return "已更新本餐，菜品未变";
        return "已调整本餐菜单，共"+after.size()+"道菜";
    }

    private static String calendar(Map<String,Object> actual) {
        Object date=actual.get("date");String meal=meal(actual.get("mealType"));
        if(date instanceof String&&((String)date).matches("\\d{4}-\\d{2}-\\d{2}")&&!meal.isEmpty())try {
            if(LocalDate.parse((String)date).getYear()>0)return "已保存到"+date+meal;
        }catch(java.time.DateTimeException invalid){/* Historical incomplete receipts keep a truthful generic result. */}
        return "已保存到日历";
    }
    private static String meal(Object value){return "breakfast".equals(value)?"早餐":"lunch".equals(value)?"午餐":"dinner".equals(value)?"晚餐":"";}
    private static String dishType(String value){return "veg".equals(value)?"素菜":"meat".equals(value)?"荤菜":"soup".equals(value)?"汤":"staple".equals(value)?"主食":"这道菜";}
    private static String type(Object dishes,int index){Object value=((List<?>)dishes).get(index);Object type=value instanceof Map?((Map<?,?>)value).get("type"):null;return type instanceof String?(String)type:"";}
    private static Integer people(Object value){if(!(value instanceof Number))return null;Number n=(Number)value;return n.doubleValue()==n.intValue()&&n.intValue()>=1&&n.intValue()<=50?n.intValue():null;}
    private static List<Long> ids(Object value) {
        if(!(value instanceof List))return null;
        List<Long> ids=new ArrayList<>();
        for(Object row:(List<?>)value){Object id=row instanceof Map?((Map<?,?>)row).get("id"):null;if(!(id instanceof Number)||((Number)id).longValue()<1||((Number)id).doubleValue()!=((Number)id).longValue())return null;ids.add(((Number)id).longValue());}
        return new HashSet<>(ids).size()==ids.size()?ids:null;
    }
}
