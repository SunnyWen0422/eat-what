package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import lombok.Data;
import java.util.*;

/** Intents carry references only. ResolvedSource is assembled exclusively by the procurement service. */
public final class AssistantShoppingContract {
 private AssistantShoppingContract() { }
 @Data public static class ShoppingSourceRef { private String kind,workspaceId,date,mealType; }
 @Data public static class ShoppingIntent {
  private ShoppingSourceRef sourceRef;
  private List<String> selectedSourceKeys,excludedOwnedIngredients;
 }
 @Data public static class RepreviewRequest {
  private String requestId;
  private List<String> selectedSourceKeys,excludedOwnedIngredients;
 }
 @Data public static class ResolvedSource {
  private ShoppingSourceRef sourceRef;
  private String date,mealType,workspaceId,semanticHash;
  private Integer people;
  private Long workspaceRevision,planVersion,planRevision;
  private List<Dish> dishes=new ArrayList<>();
 }
}
