package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantShoppingBoundaryTest {
    @Test void actualJavaShoppingReadsPassStrictPythonAndMockAsgiAndDeserializeBack() throws Exception {
        String python=System.getProperty("recommendation.python");Assumptions.assumeTrue(python!=null,"Explicit isolated Python runtime required");
        AssistantShoppingReadTest.Fixture f=new AssistantShoppingReadTest.Fixture();AssistantReadToolService service=f.configured();List<ReadResult> reads=new ArrayList<>();
        reads.add(service.read(7L,f.call("read_shopping","limit",1),f.scope));
        ReadResult full=service.read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope);reads.add(full);
        reads.add(service.read(7L,f.call("read_shopping","includePrices",true,"status","checked"),f.scope));
        ShoppingPreviewItemDTO unquantified=f.pending.getDishes().get(0).getItems().get(1);unquantified.setQuantityValue(null);unquantified.setQuantityText("适量");unquantified.setCalculationStatus("NEEDS_ADJUSTMENT");unquantified.setServingsVerified(false);
        reads.add(service.read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope));
        when(f.prices.query(anyList())).thenThrow(new IllegalStateException("synthetic unavailable"));reads.add(service.read(7L,f.call("read_shopping","includePrices",true,"limit",1),f.scope));
        StepInput input=new StepInput();input.setMessage("这份待买清单参考要花多少？");ModelContext context=new ModelContext();context.getCapabilities().add("read_shopping");input.setContext(context);input.getReadResults().add(full);
        Map<String,Object> call=AssistantV4ContextService.map("id",full.getCallId(),"type","function","function",AssistantV4ContextService.map("name","read_shopping","arguments","{\"includePrices\":true,\"limit\":1}"));
        ProviderContinuation continuation=new ProviderContinuation();Map<String,Object> message=AssistantV4ContextService.map("role","assistant","content",null,"tool_calls",Collections.singletonList(call));continuation.setAssistantMessage(message);continuation.getMessages().add(message);input.setProviderContinuation(continuation);
        Path script=Paths.get("..").toAbsolutePath().normalize().resolve("scripts/check_assistant_shopping_boundary.py"),resultFile=Files.createTempFile("assistant-shopping-boundary-",".json");Process process=new ProcessBuilder(python,script.toString()).redirectErrorStream(true).redirectOutput(resultFile.toFile()).start();
        try{
        try(java.io.OutputStream output=process.getOutputStream()){output.write(f.json.writeValueAsBytes(AssistantV4ContextService.map("reads",reads,"input",input)));}
        if(!process.waitFor(30,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);fail("Guarded shopping JSON/ASGI boundary timed out");}
        String output=new String(Files.readAllBytes(resultFile),StandardCharsets.UTF_8);assertEquals(0,process.exitValue(),output);JsonNode returned=f.json.readTree(output);assertEquals("final",returned.path("asgiType").asText());assertEquals(1,returned.path("providerCalls").asInt());assertEquals(5,returned.path("validatedReads").size());
        for(int i=0;i<reads.size();i++){ReadResult restored=f.json.treeToValue(returned.path("validatedReads").get(i),ReadResult.class);assertEquals(f.json.readTree(f.json.writeValueAsBytes(reads.get(i))),f.json.readTree(f.json.writeValueAsBytes(restored)));}
        assertNull(reads.get(0).getPriceEstimate());assertEquals(35,full.getPriceEstimate().get("totalCount"));assertTrue((Boolean)full.getPriceEstimate().get("sourcesTruncated"));assertEquals(false,reads.get(3).getPriceEstimate().get("complete"));assertEquals(false,reads.get(4).getPriceEstimate().get("serviceAvailable"));
        }finally{if(process.isAlive())process.destroyForcibly();Files.deleteIfExists(resultFile);}
    }
}
