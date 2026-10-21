package com.eatwhat.dto;

import com.eatwhat.dto.AssistantV4Contract.TurnScope;
import lombok.Data;
import java.util.*;

/** Action-only internal types. They are never bound from a public HTTP request. */
public final class AssistantActionContract {
 private AssistantActionContract() {}
 @Data public static class DraftIntent {
  private String operation;
  private String selectionMode;
  private Map<String,Object> contextPatch;
  private Long targetDishId,replacementDishId;
  private RecommendationCriteria targetConstraints;
  private List<Long> selectedDishIds,keepDishIds,releaseDishIds;
 }
 @Data public static class TurnBinding {
  private TurnScope scope; private String requestId,stepId;
 }
 @Data public static class CalendarSaveIntent {
  private String sourceWorkspaceId,targetDate,targetMealType;
 }
 /** Produced only after Java has checked the model's intent and current authenticated scope. */
 public static final class ValidatedAssistantDraft {
  public final DraftIntent intent; public final Set<Long> authorizedDishIds;
  public final String sessionId,stepId;
  public ValidatedAssistantDraft(DraftIntent intent,Set<Long> authorized,String sessionId,String stepId){
   this.intent=intent;this.authorizedDishIds=Collections.unmodifiableSet(new LinkedHashSet<>(authorized));this.sessionId=sessionId;this.stepId=stepId;
  }
 }
 @Data public static class CalendarSavedReceipt {
  private String taskId,parentTurnId,continuationStepId,sourceWorkspaceId,sourceDate,sourceMealType,sourceContentHash,targetDate,targetMealType,receiptRef;
  private Long sourcePlanVersion,sourceWorkspaceRevision,targetPlanRevision;
 }
 public interface CalendarSavedListener { void afterSaved(Long user,CalendarSavedReceipt receipt); }
}
