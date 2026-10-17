package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import java.util.*;
import java.util.regex.*;

/** Converts only unambiguous current-meal wording; ambiguous wording never becomes an applied constraint. */
public final class AssistantRequirementResolver {
 @Data public static class RequirementDecision {private String status,clarificationKind;private ActionProposal validatedProposal;}
 @SuppressWarnings("unchecked") public RequirementDecision resolve(ModelContext context,ActionProposal proposal){
  RequirementDecision result=new RequirementDecision();result.setStatus("applicable");
  ActionProposal copy=new ObjectMapper().convertValue(proposal,ActionProposal.class);result.setValidatedProposal(copy);
  for(ActionIntent action:copy.getSteps())if("draft_update".equals(action.getKind())){
   Map<String,Object> args=action.getArguments();Object raw=args.get("contextPatch");
   if(raw instanceof Map){Map<String,Object> patch=(Map<String,Object>)raw;Object words=patch.get("requirements");
    if(words instanceof String&&!((String)words).trim().isEmpty()){
     String text=((String)words).trim();Map<String,Object> criteria=patch.get("criteria") instanceof Map?new LinkedHashMap<>((Map<String,Object>)patch.get("criteria")):new LinkedHashMap<>();
     Matcher exclusion=Pattern.compile("(?:这餐|本餐)?(?:不吃|不要)([\\p{IsHan}]{1,8})").matcher(text);
     Matcher minutes=Pattern.compile("(?:这餐)?每道菜(?:最多|不超过)([1-9][0-9]{0,2})分钟").matcher(text);
     Matcher people=Pattern.compile("(?:这餐|本餐)?(?:改成|安排)?([1-9]|[1-4][0-9]|50)人(?:用餐)?").matcher(text);
     if(exclusion.matches()&&!Pattern.compile("或|一点|永久|油量|盐量").matcher(exclusion.group(1)).find()&&!Arrays.asList("辣","油","盐").contains(exclusion.group(1))){
      LinkedHashSet<String> excluded=new LinkedHashSet<>();Object hard=context.getConstraints().get("hard");if(hard instanceof Map)addStrings(excluded,((Map<?,?>)hard).get("excludedIngredients"));addStrings(excluded,criteria.get("excludedIngredients"));excluded.add(exclusion.group(1));
      if(excluded.size()>30)return clarify(result);criteria.put("excludedIngredients",new ArrayList<>(excluded));patch.put("criteria",criteria);
     }else if(minutes.matches()&&Integer.parseInt(minutes.group(1))<=240){criteria.put("maxCookMinutes",Integer.valueOf(minutes.group(1)));patch.put("criteria",criteria);}
     else if(people.matches())patch.put("people",Integer.valueOf(people.group(1)));
     else return clarify(result);
     patch.remove("requirements");
    }
   }
   if(args.containsKey("targetConstraints")&&!args.containsKey("targetDishId")){
    Object clarification=context.getRequestContext().get("clarification");Object selection=clarification instanceof Map?((Map<?,?>)clarification).get("selection"):null;
    Object id=selection instanceof Map?((Map<?,?>)selection).get("dishId"):null;
    if(id instanceof Number)args.put("targetDishId",id);
   }
  }return result;
 }
 private RequirementDecision clarify(RequirementDecision value){value.setStatus("needs_input");value.setClarificationKind("meal_requirement");value.setValidatedProposal(null);return value;}
 private static void addStrings(Set<String> result,Object value){if(value instanceof List)for(Object item:(List<?>)value)if(item instanceof String)result.add((String)item);}
}
