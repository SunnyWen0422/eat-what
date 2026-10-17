package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.ReadResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** One instance per turn. Only callers with an authoritative fresh version can reuse data. */
public final class AssistantTurnReadCache {
 private final ObjectMapper json;private final Map<String,ReadResult> values=new HashMap<>();
 public AssistantTurnReadCache(ObjectMapper json){this.json=json;}
 public ReadResult find(String name,Map<String,Object> arguments,String version){if(version==null)return null;ReadResult value=values.get(key(name,arguments,version));return value==null?null:json.convertValue(value,ReadResult.class);}
 public void put(String name,Map<String,Object> arguments,String version,ReadResult result){if(version!=null&&result!=null&&name.equals(result.getName())&&version.equals(result.getSourceVersion())&&values.size()<8)values.put(key(name,arguments,version),json.convertValue(result,ReadResult.class));}
 private String key(String name,Map<String,Object> arguments,String version){try{return name+":"+json.writeValueAsString(normalize(arguments))+":"+version;}catch(Exception invalid){throw new IllegalArgumentException("查询参数无效",invalid);}}
 private Object normalize(Object value){if(value instanceof Map){Map<String,Object> sorted=new TreeMap<>();for(Map.Entry<?,?> item:((Map<?,?>)value).entrySet())sorted.put(String.valueOf(item.getKey()),normalize(item.getValue()));return sorted;}if(value instanceof List){List<Object> ordered=new ArrayList<>();for(Object item:(List<?>)value)ordered.add(normalize(item));return ordered;}return value;}
}
