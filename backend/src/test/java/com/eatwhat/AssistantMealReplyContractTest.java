package com.eatwhat;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class AssistantMealReplyContractTest {
 @Test void disabled_feature_omits_new_fields() throws Exception {
  String value=new ObjectMapper().writeValueAsString(new StepInput());
  assertFalse(value.contains("replyContract"));assertFalse(value.contains("answerBasis"));
 }
 @Test void negotiated_answer_has_typed_shape() throws Exception {
  StepInput input=new StepInput();input.setReplyContract("meal_reply.v1");input.setAnswerBasis(new AnswerBasis());
  assertEquals("meal_reply.v1",new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(input)).get("replyContract").asText());
  StepOutput output=new ObjectMapper().readValue("{\"type\":\"final\",\"answer\":{\"segments\":[],\"cardRefs\":[]}}",StepOutput.class);
  assertNotNull(output.getAnswer());assertTrue(output.getAnswer().getCardRefs().isEmpty());
 }
}
