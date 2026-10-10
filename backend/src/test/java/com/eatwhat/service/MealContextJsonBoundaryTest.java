package com.eatwhat.service;

import com.eatwhat.dto.MealContext;
import com.eatwhat.dto.WorkspaceRequest;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.http.MockHttpInputMessage;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real Spring JSON converter, nested production DTO and pure rules; no application or model starts. */
class MealContextJsonBoundaryTest {
    private final MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter();

    private WorkspaceRequest read(String contextFields) throws Exception {
        return read(contextFields, "");
    }
    private WorkspaceRequest read(String contextFields, String requestFields) throws Exception {
        String body="{\"requestId\":\"boundary-test\",\"expectedWorkspaceRevision\":0,"+requestFields
                +"\"context\":{\"date\":\"2026-10-09\",\"mealType\":\"dinner\",\"compositionMode\":\"manual\","+contextFields+"}}";
        MockHttpInputMessage input=new MockHttpInputMessage(body.getBytes(StandardCharsets.UTF_8));
        input.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        return (WorkspaceRequest)converter.read(WorkspaceRequest.class,input);
    }
    private MealContext normalized(String contextFields) throws Exception {
        return MealWorkspaceRules.normalize(read(contextFields).getContext());
    }

    @ParameterizedTest
    @ValueSource(strings={"2.5","10.9","-0.9","0.9","1e-1","2.00000000000000001"})
    void fractionalCountsCannotBeTruncatedAtNestedRequestBoundary(String raw) {
        assertThrows(HttpMessageNotReadableException.class,()->read("\"people\":2,\"counts\":{\"meat\":"+raw+"}"));
    }
    @Test void negativeFractionCannotDisappearAsAValidZeroCategory() {
        assertThrows(HttpMessageNotReadableException.class,()->read("\"people\":2,\"counts\":{\"meat\":1,\"soup\":-0.9}"));
    }
    @ParameterizedTest
    @ValueSource(strings={"2.5","50.9","0.9","-0.9","1e-1","2.00000000000000001"})
    void fractionalPeopleCannotBeTruncatedAtNestedRequestBoundary(String raw) {
        assertThrows(HttpMessageNotReadableException.class,()->read("\"people\":"+raw+",\"counts\":{\"meat\":1}"));
    }
    @Test void integerPeopleAndZeroTenCategoryBoundariesRemainValid() throws Exception {
        for(int people:Arrays.asList(1,50)) {
            MealContext context=normalized("\"people\":"+people+",\"counts\":{\"meat\":10,\"soup\":0}");
            assertEquals(people,context.getPeople());assertEquals(10,context.getCounts().get("meat"));assertEquals(0,context.getCounts().get("soup"));
        }
    }
    @Test void allSixCategoryKeysCanFormAValidTenDishTotal() throws Exception {
        MealContext context=normalized("\"people\":2,\"counts\":{\"meat\":2,\"veg\":2,\"soup\":2,\"staple\":2,\"dessert\":2,\"side\":0}");
        assertEquals(6,context.getCounts().size());assertEquals(10,context.getCounts().values().stream().mapToInt(Integer::intValue).sum());
    }
    @Test void mathematicallyIntegralNumberTokensRemainCompatible() throws Exception {
        for(String raw:Arrays.asList("2.0","2e0","2.00000000000000000")) {
            MealContext context=normalized("\"people\":"+raw+",\"counts\":{\"meat\":10.0,\"soup\":-0.0}");
            assertEquals(2,context.getPeople());assertEquals(10,context.getCounts().get("meat"));assertEquals(0,context.getCounts().get("soup"));
        }
        assertEquals(50,normalized("\"people\":50.0,\"counts\":{\"meat\":1.0}").getPeople());
    }
    @Test void ordinaryLegacyIntegerStringsRemainCompatible() throws Exception {
        for(String raw:Arrays.asList("2"," 2 ","+2","02")) {
            MealContext context=normalized("\"people\":\""+raw+"\",\"counts\":{\"meat\":\"02\",\"soup\":\"0\"}");
            assertEquals(2,context.getPeople());assertEquals(2,context.getCounts().get("meat"));assertEquals(0,context.getCounts().get("soup"));
        }
    }
    @Test void ruleRangesTotalsNullAndUnknownKeysStillRejectWithoutLossyAcceptance() {
        for(String fields:Arrays.asList(
                "\"people\":0,\"counts\":{\"meat\":1}","\"people\":51,\"counts\":{\"meat\":1}",
                "\"people\":null,\"counts\":{\"meat\":1}","\"people\":2,\"counts\":null",
                "\"people\":2,\"counts\":{}","\"people\":2,\"counts\":{\"meat\":null}",
                "\"people\":2,\"counts\":{\"unknown\":1}","\"people\":2,\"counts\":{\"meat\":-1}",
                "\"people\":2,\"counts\":{\"meat\":11}","\"people\":2,\"counts\":{\"meat\":0}",
                "\"people\":2,\"counts\":{\"meat\":6,\"veg\":5}")) {
            assertThrows(IllegalArgumentException.class,()->normalized(fields),fields);
        }
    }
    @Test void numericOverflowAndUnsupportedJsonTypesCannotProduceIntegers() {
        for(String raw:Arrays.asList("2147483648","1e30","true","[]","{}","\"2.5\"")) {
            assertThrows(HttpMessageNotReadableException.class,()->read("\"people\":"+raw+",\"counts\":{\"meat\":1}"),raw);
            assertThrows(HttpMessageNotReadableException.class,()->read("\"people\":2,\"counts\":{\"meat\":"+raw+"}"),raw);
        }
    }
    @Test void omittedPeopleAndCompositionDefaultsRemainUnchanged() throws Exception {
        assertEquals(2,normalized("\"counts\":{\"meat\":1}").getPeople());
        MealContext context=new ObjectMapper().readValue("{\"date\":\"2026-10-09\"}",MealContext.class);
        MealWorkspaceRules.normalize(context);
        assertEquals(2,context.getPeople());assertEquals("auto",context.getCompositionMode());
        assertEquals(Integer.valueOf(1),context.getCounts().get("meat"));assertEquals(Integer.valueOf(1),context.getCounts().get("veg"));
    }
    @Test void exactFieldParsingAppliesToDirectDtoAndTypedContextCopies() throws Exception {
        ObjectMapper mapper=new ObjectMapper();
        assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,()->mapper.readValue("{\"people\":50.9}",MealContext.class));
        assertThrows(IllegalArgumentException.class,()->mapper.convertValue(Collections.singletonMap("counts",Collections.singletonMap("meat",10.9)),MealContext.class));
        MealContext original=normalized("\"people\":50,\"counts\":{\"meat\":10,\"soup\":0}");
        MealContext copy=mapper.convertValue(original,MealContext.class);
        assertEquals(original,copy);
    }
    @Test void theConverterDoesNotChangeCoercionOfUnrelatedLegacyFields() throws Exception {
        assertTrue(converter.getObjectMapper().isEnabled(DeserializationFeature.ACCEPT_FLOAT_AS_INT));
        WorkspaceRequest request=read("\"people\":2,\"counts\":{\"meat\":1},\"totalCookMinutes\":10.9", "\"dishId\":3.9,");
        assertEquals(3L,request.getDishId());assertEquals(10,request.getContext().getTotalCookMinutes());
    }
}
