package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.math.BigDecimal;
import java.math.RoundingMode;

/** Server-authored read prose. No provider text, historical message or write receipt is accepted. */
final class AssistantFactReplyFormatter {
    // Eight existing tool reads plus one explicitly selected authenticated context snapshot.
    private static final int MAX_FACTS=9, MAX_ROWS=60, MAX_REPLY=1800;
    private static final String EMPTY="请说明想查询的菜品、日期或餐次";
    private static final ObjectMapper JSON=new ObjectMapper();

    /** Internal only: created after the registry executor and turn ownership checks succeed. */
    static final class AuthorizedReadFact {
        final String name;
        final List<Map<String,Object>> items;
        final boolean partial,unknown,contextSnapshot;
        private AuthorizedReadFact(ReadResult read,boolean paged,boolean contextSnapshot){
            name=read.getName();items=Collections.unmodifiableList(rows(snapshot(read.getItems())));
            this.contextSnapshot=contextSnapshot;
            partial=paged||read.isTruncated()||read.getNextCursor()!=null;
            unknown=read.getUnknownFields()!=null&&!read.getUnknownFields().isEmpty();
        }
        static AuthorizedReadFact fromRead(ReadResult read,ToolRead call){
            if(read==null||call==null||!Objects.equals(read.getName(),call.getName())||!Objects.equals(read.getCallId(),call.getCallId()))throw new IllegalArgumentException("查询结果不匹配");
            return new AuthorizedReadFact(read,call.getArguments()!=null&&call.getArguments().get("cursor")!=null,false);
        }
        /** ContextService has already checked user, workspace and version; not a model fact source. */
        static AuthorizedReadFact fromContext(ReadResult read){
            if(read==null||!Arrays.asList("read_current_meal","read_actual_diet_review").contains(read.getName()))throw new IllegalArgumentException("上下文来源无效");
            return new AuthorizedReadFact(read,false,true);
        }
        private static Object snapshot(Object value){
            if(value instanceof JsonNode)return snapshot(JSON.convertValue(value,Object.class));
            if(value instanceof Map){Map<String,Object> copy=new LinkedHashMap<>();for(Map.Entry<?,?> entry:((Map<?,?>)value).entrySet())if(entry.getKey() instanceof String)copy.put((String)entry.getKey(),snapshot(entry.getValue()));return Collections.unmodifiableMap(copy);}
            if(value instanceof List){List<Object> copy=new ArrayList<>();for(Object item:(List<?>)value)copy.add(snapshot(item));return Collections.unmodifiableList(copy);}
            return value instanceof String||value instanceof Number||value instanceof Boolean?value:null;
        }
    }
    private static final class Group {
        final String name;final Map<String,Map<String,Object>> items=new LinkedHashMap<>();boolean partial,unknown,hasExecutorRead;
        Group(String name){this.name=name;}
        void add(AuthorizedReadFact fact){
            // Context was captured before the tool read and may have been budget-clipped.
            // Even an empty or partial executor result supersedes same-kind context facts.
            if(fact.contextSnapshot&&hasExecutorRead)return;
            if(!fact.contextSnapshot&&!hasExecutorRead){items.clear();partial=false;unknown=false;hasExecutorRead=true;}
            partial|=fact.partial;unknown|=fact.unknown;
            for(Map<String,Object> row:fact.items){
                String key=identity(row);if(items.containsKey(key)){items.put(key,row);continue;}
                if(items.size()==MAX_ROWS){partial=true;break;}items.put(key,row);
            }
        }
        List<Map<String,Object>> rows(){return new ArrayList<>(items.values());}
    }
    String format(List<AuthorizedReadFact> facts,ModelContext context){
        // context is intentionally not read implicitly. A selected context fallback must first
        // be wrapped at the service's authenticated boundary, just like an executed read.
        Map<String,Group> groups=new LinkedHashMap<>();int consumed=0;boolean bounded=false;
        for(AuthorizedReadFact fact:facts==null?Collections.<AuthorizedReadFact>emptyList():facts){
            if(consumed++==MAX_FACTS){bounded=true;break;}
            if(fact==null||!registered(fact.name))continue;
            groups.computeIfAbsent(fact.name,Group::new).add(fact);
        }
        LinkedHashSet<String> lines=new LinkedHashSet<>();int chars=0;boolean unknown=false;
        for(Group group:groups.values()){
            group.partial|=bounded;String line=sentence(group)+(group.partial?"（部分结果）":"");
            if(chars+line.length()+1>MAX_REPLY-80){bounded=true;break;}
            lines.add(line);chars+=line.length()+1;unknown|=group.unknown;
            for(Map<String,Object> row:group.rows())if(!list(row.get("omittedFields")).isEmpty())unknown=true;
        }
        if(lines.isEmpty())return EMPTY;
        String nutrition=nutrition(facts);if(!nutrition.isEmpty()&&chars+nutrition.length()<MAX_REPLY-100)lines.add(nutrition);
        if(unknown)lines.add("部分字段未提供，未知项保持未知。");
        if(bounded)lines.add("其余部分查询结果见卡片。");
        return String.join("\n",lines);
    }
    /** Only authenticated recipe facts and recorded-meal snapshots supply these numbers. */
    String nutrition(List<AuthorizedReadFact> facts){
        Map<String,Group> groups=new LinkedHashMap<>();int count=0;boolean partial=false;
        for(AuthorizedReadFact fact:facts==null?Collections.<AuthorizedReadFact>emptyList():facts){
            if(count++==MAX_FACTS){partial=true;break;}
            if(fact==null||!Arrays.asList("get_dish_details","read_actual_diet_review").contains(fact.name))continue;
            groups.computeIfAbsent(fact.name,Group::new).add(fact);
        }
        List<String> lines=new ArrayList<>();int chars=0;
        for(Group group:groups.values())for(Map<String,Object> row:group.rows()){
            partial|=group.partial;
            if(lines.size()>=10){partial=true;break;}
            if("get_dish_details".equals(group.name)){
                Map<String,Object> n=object(row.get("nutrition"));if(n.isEmpty())continue;
                BigDecimal energy="complete".equals(n.get("completeness"))?energy(n.get("total")):null;
                String line="「"+label(row.get("name"))+"」"+(energy==null?"整道能量暂缺。":"整道"+rounded(energy)+"千卡");
                Object diners=row.get("diners");
                if(energy!=null&&diners instanceof Number&&((Number)diners).intValue()>0){int people=((Number)diners).intValue();line+="；"+people+"人均分每人约"+energy.divide(BigDecimal.valueOf(people),0,RoundingMode.HALF_UP).toPlainString()+"千卡。";}
                else if(energy!=null)line+="。";
                if(chars+line.length()>900){partial=true;break;}lines.add(line);chars+=line.length();
            }else for(Map<String,Object> meal:rows(row.get("actual"))){
                if(!"eaten".equals(meal.get("status")))continue;Map<String,Object> n=object(meal.get("nutrition"));
                if(!"recipe_baseline".equals(n.get("basis")))continue;
                BigDecimal total=Boolean.TRUE.equals(n.get("complete"))?energy(n.get("total")):null,known=energy(n.get("knownTotal"));
                String line=date(row.get("date"))+mealType(meal.get("mealType"))+"已记录菜品的配方能量：";
                if(total!=null)line+=rounded(total)+"千卡";
                else{line+="完整能量暂缺";if(known!=null&&n.get("coveredCount") instanceof Number&&n.get("entryCount") instanceof Number)line+="，其中"+n.get("coveredCount")+"/"+n.get("entryCount")+"道可计算部分为"+rounded(known)+"千卡";}
                line+="；不代表个人摄入。";if(chars+line.length()>900||lines.size()>=10){partial=true;break;}lines.add(line);chars+=line.length();
            }
        }
        if(partial&&!lines.isEmpty())lines.add("以上仅为本次查询到的部分营养信息。");
        return String.join("\n",lines);
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> object(Object value){return value instanceof Map?(Map<String,Object>)value:Collections.emptyMap();}
    private static BigDecimal energy(Object value){Object number=object(value).get("energyKcal");if(!(number instanceof Number))return null;try{BigDecimal n=new BigDecimal(number.toString());return n.signum()<0?null:n;}catch(NumberFormatException e){return null;}}
    private static String rounded(BigDecimal n){return n.setScale(0,RoundingMode.HALF_UP).toPlainString();}
    private static boolean registered(String name){return AssistantReadToolService.READS.contains(name)||AssistantPersonalReadService.READS.contains(name);}
    private static String identity(Map<String,Object> row){
        if(row.get("date")!=null)return "date:"+row.get("date");
        if(row.get("id")!=null)return "id:"+row.get("id");
        if(row.get("dishId")!=null)return "dish:"+row.get("dishId");
        if(row.get("group")!=null)return "option:"+row.get("group")+":"+row.get("code");
        return row.toString();
    }
    private String sentence(Group group){
        List<Map<String,Object>> rows=group.rows();int n=rows.size();String names=names(rows);
        switch(group.name){
            case "search_dishes":return n==0?"菜谱这次未查到匹配结果。":"菜谱这次查到"+n+"道"+names+"。";
            case "search_by_ingredients":return n==0?"按食材这次未查到匹配菜谱。":"按食材这次查到"+n+"道菜"+names+"。";
            case "get_dish_details":return n==0?"这次未返回菜谱详情。":"菜谱详情这次查到"+n+"道"+names+"，已提供的内容见卡片。";
            case "get_dish_methods":
                if(n==0)return "这次未返回菜谱做法。";
                int provided=0;for(Map<String,Object> row:rows)if(hasText(row.get("steps"))||hasText(row.get("methods")))provided++;
                String subject=names.isEmpty()?"菜谱":names.substring(1);
                return provided==0?subject+"的做法暂未提供。":subject+"的做法已读到"+(provided<n?"部分":"")+"，步骤见卡片。";
            case "read_favorites":return n==0?"收藏这次未查到匹配菜谱。":"收藏这次查到"+n+"道菜"+names+"。";
            case "read_saved_menus":
                if(n==0)return "常用菜单这次未查到匹配记录。";
                List<String> menus=new ArrayList<>();for(Map<String,Object> menu:rows){if(menus.size()==3)break;String menuName=label(menu.get("name"));if(menuName.isEmpty())continue;menus.add("「"+menuName+"」"+number(menu.get("people"),"人")+(menu.get("dishIds") instanceof List?" · "+list(menu.get("dishIds")).size()+"道菜":""));}
                return "常用菜单这次查到"+n+"份"+(menus.isEmpty()?"":"："+String.join("；",menus))+"。";
            case "get_recommendation_options":
                List<String> labels=new ArrayList<>();for(Map<String,Object> row:rows){String label=label(row.get("label"));if(label.isEmpty())label=optionGroup(row.get("group"));if(!label.isEmpty()&&!labels.contains(label)&&labels.size()<6)labels.add(label);}
                return labels.isEmpty()?"这次未返回可用筛选选项。":"这次读到可用筛选选项："+String.join("、",labels)+"。";
            case "read_current_meal":return currentMeal(rows);
            case "read_shopping":
                if(n==0)return "采购这次查询未返回清单项。";
                int checked=0,pending=0;
                for(Map<String,Object> row:rows){if(Boolean.TRUE.equals(row.get("checked")))checked++;else if(Boolean.FALSE.equals(row.get("checked")))pending++;}
                return "采购这次查到"+n+"项"+names+"；其中"+checked+"项已勾选、"+pending+"项待采购"+(checked+pending<n?"，其余勾选状态未知":"")+"。";
            case "read_calendar":
            case "read_actual_diet_review":
                int plans=0,actual=0;for(Map<String,Object> day:rows){plans+=list(day.get("plans")).size();for(Map<String,Object> meal:rows(day.get("actual")))if("eaten".equals(meal.get("status")))actual++;}
                String range=dateRange(rows);
                if("read_calendar".equals(group.name))return "日历"+range+"这次查到"+plans+"餐计划、"+actual+"餐实吃记录。计划安排不代表已经吃过。";
                return actual==0?"实吃"+range+"这次未查到明确记录；没有记录不能判断是否进餐。":"实吃"+range+"这次查到"+actual+"餐明确记录，仅包含已记录为吃过的餐次。";
            default:return EMPTY;
        }
    }
    private String currentMeal(List<Map<String,Object>> rows){
        if(rows.isEmpty())return "这次未返回当前餐内容。";
        Map<String,Object> meal=rows.get(0);String day=date(meal.get("date")),type=mealType(meal.get("mealType"));
        String text="当前餐"+(day.isEmpty()?"":day)+(type.isEmpty()?"":type)+number(meal.get("people"),"人");
        if(meal.get("currentDishes") instanceof List){List<Map<String,Object>> dishes=rows(meal.get("currentDishes"));text+="，这次读到"+dishes.size()+"道菜"+names(dishes);}
        else text+="，菜单内容暂未提供";
        if(meal.get("totalCookMinutes") instanceof Number&&((Number)meal.get("totalCookMinutes")).intValue()>0)text+="；整餐用时上限"+meal.get("totalCookMinutes")+"分钟";
        return text+"。";
    }
    private static String names(List<Map<String,Object>> rows){List<String> names=new ArrayList<>();for(Map<String,Object> row:rows){String name=label(row.get("name"));if(!name.isEmpty()&&!names.contains("「"+name+"」")&&names.size()<3)names.add("「"+name+"」");}return names.isEmpty()?"":"："+String.join("、",names);}
    private static String label(Object raw){if(!(raw instanceof String))return "";String value=((String)raw).replaceAll("[\\p{Cntrl}「」]"," ").trim();return value.length()>40?value.substring(0,40)+"…":value;}
    private static boolean hasText(Object value){
        if(!(value instanceof String)||((String)value).trim().isEmpty())return false;
        try{
            JsonNode node=JSON.readTree((String)value);
            if(node.isTextual())return !node.asText().trim().isEmpty();
            if(node.isArray())for(JsonNode step:node)if(step.isTextual()&&!step.asText().trim().isEmpty())return true;
            return false;
        }catch(java.io.IOException plainText){return true;}
    }
    private static String number(Object value,String suffix){return value instanceof Number&&((Number)value).longValue()>0?" · "+((Number)value).longValue()+suffix:"";}
    private static String date(Object value){return value instanceof String&&((String)value).matches("\\d{4}-\\d{2}-\\d{2}")?(String)value:"";}
    private static String dateRange(List<Map<String,Object>> rows){TreeSet<String> dates=new TreeSet<>();for(Map<String,Object> row:rows){String day=date(row.get("date"));if(!day.isEmpty())dates.add(day);}return dates.isEmpty()?"":"（"+dates.first()+(dates.size()>1?"至"+dates.last():"")+"）";}
    private static String mealType(Object value){return "breakfast".equals(value)?"早餐":"lunch".equals(value)?"午餐":"dinner".equals(value)?"晚餐":"";}
    private static String optionGroup(Object value){return "cuisine".equals(value)?"菜系":"flavor".equals(value)?"口味":"scene".equals(value)?"用餐场景":"diet".equals(value)?"饮食偏好":"method".equals(value)?"做法":"";}
    private static List<?> list(Object value){return value instanceof List?(List<?>)value:Collections.emptyList();}
    @SuppressWarnings("unchecked") private static List<Map<String,Object>> rows(Object value){List<Map<String,Object>> result=new ArrayList<>();for(Object row:list(value))if(row instanceof Map)result.add((Map<String,Object>)row);return result;}
}
