package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

class BalancedRecommendationBoundaryTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings={"想吃清淡些，30分钟左右","换掉第二道菜"})
    void javaContextPassesPythonAsgiAndReturnedIntentPassesJavaValidator(String message) throws Exception {
        String python=System.getProperty("recommendation.python");Assumptions.assumeTrue(python!=null,"Set recommendation.python to the isolated test interpreter");
        AssistantV4ContextTest.Fixture f=new AssistantV4ContextTest.Fixture();f.w.getContext().setRecommendationPolicy(BalancedRecommendationPolicy.VERSION);
        f.w.getContext().getRecommendationPreferences().setIncludeTagCodes(Arrays.asList("LIGHT"));f.w.getContext().setExpectedTotalCookMinutes(30);
        StepInput input=new StepInput();input.setContext(f.service().build(7L,f.request,f.session));input.getContext().getCapabilities().add("draft_update");input.setMessage(message);
        Path script=Paths.get("..").toAbsolutePath().normalize().resolve("scripts/check_balanced_boundary.py");
        Process child=new ProcessBuilder(python,script.toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start();
        try(OutputStream stdin=child.getOutputStream()){stdin.write(f.json.writeValueAsBytes(input));}
        byte[] output=child.getInputStream().readAllBytes();assertTrue(child.waitFor(30,TimeUnit.SECONDS));assertEquals(0,child.exitValue(),new String(output,StandardCharsets.UTF_8));
        StepOutput result=f.json.copy().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,true).readValue(output,StepOutput.class);
        assertEquals("final",result.getType());JsonNode arguments=f.json.valueToTree(result.getActionProposal().getSteps().get(0).getArguments());
        WorkspaceAssistantToolAdapter.validateArguments(arguments);
        AssistantActionContract.DraftIntent intent=f.json.treeToValue(arguments,AssistantActionContract.DraftIntent.class);
        assertEquals("recommend",intent.getSelectionMode());assertNull(intent.getSelectedDishIds());if(!message.equals("换掉第二道菜"))assertEquals(30,intent.getContextPatch().get("expectedTotalCookMinutes"));
        AssistantWorkspaceActionTest.DraftFixture domain=new AssistantWorkspaceActionTest.DraftFixture();MealWorkspace menu=domain.apply(intent,"python-intent");
        assertEquals(3,menu.getDraft().getDishes().size());assertEquals("balanced-v1",menu.getContext().getRecommendationPolicy());assertFalse(menu.getRecommendationCycle().isEmpty());
        if(message.equals("换掉第二道菜"))assertEquals(4L,menu.getDraft().getDishes().get(1).getId());
    }
}
