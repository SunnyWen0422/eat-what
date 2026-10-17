package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class AssistantAnswerPolicyTest {
 final ObjectMapper json=new ObjectMapper();
 ModelContext context(){ModelContext c=new ModelContext();c.getActiveMeal().put("currentDishes",Arrays.asList(row(1,"番茄炒蛋",15),row(2,"清炒青菜",10)));return c;}
 Map<String,Object> row(long id,String name,Integer time){Map<String,Object> m=new LinkedHashMap<>();m.put("id",id);m.put("name",name);m.put("cookMinutes",time);return m;}
 AnswerBasis basis(){return new AssistantAnswerBasisService(json).build(context(),Collections.emptyList());}
 AnswerDraft answer(String text){AnswerDraft a=new AnswerDraft();AnswerSegment s=new AnswerSegment();s.setText(text);s.setEvidenceKeys(Arrays.asList("dish:1"));a.getSegments().add(s);a.getCardRefs().add("dish:1");return a;}
 @Test void ordinary_grounded_reply_and_real_card_references_survive(){assertTrue(new AssistantAnswerPolicy().evaluate(answer("番茄炒蛋可以先选上，另一道从下面挑。"),basis()).isAccepted());}
 @Test void fabricated_reference_or_unprovided_number_is_rejected(){AnswerDraft a=answer("可以选这道。");a.getCardRefs().add("dish:999");assertFalse(new AssistantAnswerPolicy().evaluate(a,basis()).isAccepted());assertFalse(new AssistantAnswerPolicy().evaluate(answer("只需要5分钟。"),basis()).isAccepted());}
 @Test void known_comparison_is_checked_against_actual_values(){AnswerDraft a=answer("青菜预计10分钟，比番茄炒蛋更快。");AnswerSegment s=a.getSegments().get(0);s.setEvidenceKeys(Arrays.asList("dish:1","dish:2"));AnswerClaim claim=new AnswerClaim();claim.setOp("less_than");claim.setLeft("dish:2");claim.setRight("dish:1");claim.setField("cookMinutes");claim.setValue(10);s.getClaims().add(claim);assertTrue(new AssistantAnswerPolicy().evaluate(a,basis()).isAccepted());claim.setValue(5);assertFalse(new AssistantAnswerPolicy().evaluate(a,basis()).isAccepted());}
 @Test void unknown_time_is_not_a_comparison_fact(){ModelContext c=context();((Map<String,Object>)((List<?>)c.getActiveMeal().get("currentDishes")).get(1)).put("cookMinutes",null);AnswerBasis b=new AssistantAnswerBasisService(json).build(c,Collections.emptyList());assertFalse(b.getItems().get(1).getFields().containsKey("cookMinutes"));}
 @Test void authoritative_empty_current_read_does_not_fall_back_to_old_menu(){ReadResult read=new ReadResult();read.setName("read_current_meal");read.setSourceVersion("2");assertTrue(new AssistantAnswerBasisService(json).build(context(),Collections.singletonList(read)).getItems().isEmpty());}
 @Test void explicit_recipe_read_replaces_old_snapshot(){ReadResult read=new ReadResult();read.setName("get_dish_details");read.setSourceVersion("2");read.getItems().add(row(1,"新菜名",null));AnswerBasis b=new AssistantAnswerBasisService(json).build(context(),Collections.singletonList(read));assertEquals("新菜名",b.getItems().get(0).getFields().get("name"));assertFalse(b.getItems().get(0).getFields().containsKey("cookMinutes"));}
 @Test void unsupported_semantics_or_provider_urls_cannot_become_user_reply(){for(String text:Arrays.asList("已保存到明晚。","这道低脂又低盐。","这些食材足够两个人吃。","保证全部符合你的要求。","点这里 https://invalid.example","<script>alert(1)</script>"))assertFalse(new AssistantAnswerPolicy().evaluate(answer(text),basis()).isAccepted(),text);}
 @Test void length_and_duplicate_card_boundaries_are_enforced(){assertFalse(new AssistantAnswerPolicy().evaluate(answer(String.join("",Collections.nCopies(281,"字"))),basis()).isAccepted());AnswerDraft a=answer("可以先选这道。");a.getCardRefs().add("dish:1");assertFalse(new AssistantAnswerPolicy().evaluate(a,basis()).isAccepted());}
}
