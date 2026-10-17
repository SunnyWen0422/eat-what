package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.SessionSummary;

final class AssistantHistorySummary {
 static void normalize(SessionSummary row){
  row.setTitle(clip(row.getTitle(),80));row.setPreview(clip(row.getPreview(),140));
  String status=row.getLastStatus();
  if("awaiting_confirmation".equals(status))row.setPreview("等待核对并确认，尚未执行这一步。");
  else if("queued".equals(status)||"running".equals(status))row.setPreview("还有未完成的操作，可进入核对。");
  else if("partially_completed".equals(status))row.setPreview("部分步骤已完成，请核对剩余事项。");
  else if("failed".equals(status))row.setPreview("本次未完成，已有内容仍保留。");
 }
 private static String clip(String value,int limit){if(value==null)return null;String text=value.replaceAll("[\\p{Cntrl}]"," ").trim();return text.isEmpty()?null:text.substring(0,Math.min(limit,text.length()));}
}
