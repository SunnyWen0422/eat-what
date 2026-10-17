package com.eatwhat.service;

import com.eatwhat.dto.AssistantV4Contract.*;
import lombok.Data;
import java.math.BigDecimal;
import java.util.*;
import java.util.regex.*;

/** Deterministic claim checks; not a proof of arbitrary natural-language semantics. */
public final class AssistantAnswerPolicy {
 private static final Set<String> FIELDS=new HashSet<>(Arrays.asList("name","type","cookMinutes","ingredients","verifiedTags"));
 private static final Pattern UNSAFE=Pattern.compile("https?://|www\\.|<[^>]*>|javascript:|已(?:经)?(?:保存|采购|加入|记录|修改|更新)|低脂|低盐|低油|保证|肯定|足够|够.{0,5}[人份]|全部符合|一定满足|营养均衡|卡路里|千卡|元[钱]?|¥|￥");
 private static final Pattern NUMBER=Pattern.compile("[0-9]+(?:\\.[0-9]+)?");
 private static final Pattern UNVERIFIED_PROSE=Pattern.compile("[零〇一二两三四五六七八九十百半]+(?:分钟|小时|元|克|毫升)|一刻钟|(?:昨天|上次|之前|已经|曾经).{0,8}吃|吃过|确认后.{0,12}(?:写入|修改|更新|保存)");
 @Data public static class Decision {private boolean accepted;private String reply,reasonCode;private List<String> cardRefs=Collections.emptyList();}
 public Decision evaluate(AnswerDraft draft,AnswerBasis basis){
  try{
   if(draft==null||basis==null||draft.getSegments()==null||draft.getSegments().isEmpty()||draft.getSegments().size()>3||draft.getCardRefs()==null||draft.getCardRefs().size()>10)return reject("shape");
   Map<String,EvidenceItem> evidence=new HashMap<>();for(EvidenceItem item:basis.getItems())if(item==null||evidence.put(item.getKey(),item)!=null)return reject("evidence");
   if(new HashSet<>(draft.getCardRefs()).size()!=draft.getCardRefs().size()||!evidence.keySet().containsAll(draft.getCardRefs()))return reject("reference");
   List<String> lines=new ArrayList<>();int size=0;
   for(AnswerSegment segment:draft.getSegments()){
    if(segment==null||segment.getText()==null||segment.getText().trim().isEmpty()||segment.getEvidenceKeys()==null||segment.getClaims()==null||segment.getEvidenceKeys().size()>24||segment.getClaims().size()>8)return reject("segment");
    String text=segment.getText().trim();size+=text.length();if(size>280||UNSAFE.matcher(text).find()||UNVERIFIED_PROSE.matcher(text).find())return reject("unsupported_text");
    if(!evidence.keySet().containsAll(segment.getEvidenceKeys()))return reject("reference");
    Set<String> numbers=new HashSet<>();boolean comparison=false;
    for(String key:segment.getEvidenceKeys()){Object name=evidence.get(key).getFields().get("name");if(name instanceof String){Matcher digits=NUMBER.matcher((String)name);while(digits.find())numbers.add(digits.group());}}
    for(AnswerClaim claim:segment.getClaims()){
     if(claim==null||!segment.getEvidenceKeys().contains(claim.getLeft())||!FIELDS.contains(claim.getField()))return reject("claim");
     EvidenceItem left=evidence.get(claim.getLeft());Object actual=left.getFields().get(claim.getField());if(actual==null||left.getUnknownFields().contains(claim.getField()))return reject("unknown");
     if("field_value".equals(claim.getOp())){if(!equal(actual,claim.getValue()))return reject("value");}
     else{
      if(!segment.getEvidenceKeys().contains(claim.getRight()))return reject("claim");EvidenceItem right=evidence.get(claim.getRight());Object other=right.getFields().get(claim.getField());if(other==null||right.getUnknownFields().contains(claim.getField()))return reject("unknown");
      if("intersection".equals(claim.getOp())){if(!"ingredients".equals(claim.getField())||!(actual instanceof List)||!(other instanceof List))return reject("relation");LinkedHashSet<Object> common=new LinkedHashSet<>((List<?>)actual);common.retainAll((List<?>)other);if(!new ArrayList<>(common).equals(claim.getValue()))return reject("relation");}
      else if("cookMinutes".equals(claim.getField())&&actual instanceof Number&&other instanceof Number){int c=decimal(actual).compareTo(decimal(other));if(!equal(actual,claim.getValue())||!("less_than".equals(claim.getOp())&&c<0||"equal".equals(claim.getOp())&&c==0))return reject("relation");comparison=true;}
      else return reject("relation");
     }
     if(claim.getValue() instanceof Number)numbers.add(decimal(claim.getValue()).stripTrailingZeros().toPlainString());
    }
    Matcher digits=NUMBER.matcher(text);while(digits.find())if(!numbers.contains(digits.group()))return reject("unclaimed_number");
    if(Pattern.compile("更快|较快|更省时|最快|用时更短").matcher(text).find()&&!comparison)return reject("unclaimed_comparison");
    lines.add(text);
   }
   Decision result=new Decision();result.setAccepted(true);result.setReply(String.join("\n",lines));result.setCardRefs(new ArrayList<>(draft.getCardRefs()));result.setReasonCode("accepted");return result;
  }catch(RuntimeException malformed){return reject("invalid");}
 }
 private static boolean equal(Object a,Object b){return a instanceof Number&&b instanceof Number?decimal(a).compareTo(decimal(b))==0:Objects.equals(a,b);}
 private static BigDecimal decimal(Object value){return new BigDecimal(value.toString());}
 private static Decision reject(String code){Decision value=new Decision();value.setReasonCode(code);return value;}
}
