package com.eatwhat.service;

import com.eatwhat.dto.ControlledToolTask;
import com.eatwhat.util.RequestIdValidator;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** The shared bounded contract for UI and future model adapters. No arbitrary SQL or dispatch. */
public final class ControlledToolRegistry {
    public static final String READ_MEAL = "read_current_meal";
    public static final String CONFIRM_MEAL = "confirm_current_meal";
    public static final String READ_REVIEW = "read_actual_diet_review";
    private ControlledToolRegistry() { }

    public static List<ControlledToolTask.Step> validate(Map<String,Object> request) {
        fields(request,"requestId","steps");
        RequestIdValidator.requireValid(string(request,"requestId"));
        Object raw=request.get("steps");
        if (!(raw instanceof List) || ((List<?>)raw).isEmpty() || ((List<?>)raw).size()>3)
            throw new IllegalArgumentException("一次仅支持 1 至 3 个白名单工具步骤");
        List<ControlledToolTask.Step> steps=new ArrayList<>();
        int writes=0;
        for (Object value:(List<?>)raw) {
            Map<String,Object> input=object(value);fields(input,"tool","arguments");
            ControlledToolTask.Step step=new ControlledToolTask.Step();step.tool=string(input,"tool");
            Map<String,Object> args=object(input.get("arguments"));
            if (READ_MEAL.equals(step.tool) || CONFIRM_MEAL.equals(step.tool)) {
                fields(args,"date","mealType");
                step.arguments.put("date",date(args,"date").toString());
                String meal=string(args,"mealType");
                if (!Arrays.asList("breakfast","lunch","dinner").contains(meal)) throw new IllegalArgumentException("餐次无效");
                step.arguments.put("mealType",meal);
                if (CONFIRM_MEAL.equals(step.tool) && ++writes>1) throw new IllegalArgumentException("一次任务仅支持确认一餐");
            } else if (READ_REVIEW.equals(step.tool)) {
                fields(args,"startDate","endDate");
                LocalDate start=date(args,"startDate"),end=date(args,"endDate");
                if (end.isBefore(start) || ChronoUnit.DAYS.between(start,end)>366) throw new IllegalArgumentException("回顾范围应在 367 天以内");
                step.arguments.put("startDate",start.toString());step.arguments.put("endDate",end.toString());
            } else throw new IllegalArgumentException("不支持的工具："+step.tool);
            steps.add(step);
        }
        return steps;
    }
    public static List<Map<String,Object>> catalog() {
        List<Map<String,Object>> out=new ArrayList<>();
        for(String name:Arrays.asList(READ_MEAL,CONFIRM_MEAL,READ_REVIEW)) {
            Map<String,Object> tool=new LinkedHashMap<>();tool.put("name",name);tool.put("implemented",true);
            tool.put("effect",CONFIRM_MEAL.equals(name)?"write_plan":"read");
            tool.put("requiresConfirmation",CONFIRM_MEAL.equals(name));
            Map<String,Object> schema=new LinkedHashMap<>(),properties=new LinkedHashMap<>();
            List<String> required=READ_REVIEW.equals(name)?Arrays.asList("startDate","endDate"):Arrays.asList("date","mealType");
            for(String field:required) {Map<String,Object> property=new LinkedHashMap<>();property.put("type","string");if("mealType".equals(field))property.put("enum",Arrays.asList("breakfast","lunch","dinner"));else property.put("format","date");properties.put(field,property);}
            schema.put("type","object");schema.put("additionalProperties",false);schema.put("properties",properties);schema.put("required",required);
            tool.put("argumentsSchema",schema);out.add(tool);
        }
        return out;
    }
    public static void fields(Map<String,Object> value,String... allowed) {
        if(value==null)throw new IllegalArgumentException("工具参数不能为空");
        Set<String> keys=new HashSet<>(Arrays.asList(allowed));
        for(String key:value.keySet())if(!keys.contains(key))throw new IllegalArgumentException("不支持的参数："+key);
        for(String key:allowed)if(!value.containsKey(key))throw new IllegalArgumentException("缺少参数："+key);
    }
    public static String string(Map<String,Object> value,String key) {
        Object raw=value.get(key);if(!(raw instanceof String)||((String)raw).trim().isEmpty()||((String)raw).length()>100)
            throw new IllegalArgumentException("参数无效："+key);
        return (String)raw;
    }
    @SuppressWarnings("unchecked")
    private static Map<String,Object> object(Object value) {
        if(!(value instanceof Map))throw new IllegalArgumentException("工具调用必须是对象");
        for(Object key:((Map<?,?>)value).keySet())if(!(key instanceof String))throw new IllegalArgumentException("参数名无效");
        return (Map<String,Object>)value;
    }
    private static LocalDate date(Map<String,Object> value,String key) {
        String text=string(value,key);
        try {LocalDate date=LocalDate.parse(text);if(text.length()!=10||!date.toString().equals(text))throw new IllegalArgumentException();return date;}
        catch(Exception error){throw new IllegalArgumentException("日期格式应为 yyyy-MM-dd");}
    }
}
