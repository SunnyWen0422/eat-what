package com.eatwhat.service;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MealPlanServiceTest {
    @Test void dateBindingAndSerializedDayDoNotDependOnJvmZone() throws Exception {
        java.util.TimeZone previous=java.util.TimeZone.getDefault();
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
            RecipeRecord body=new RecipeRecord();body.setRecordDateString("2026-10-01");
            body.setRecordDate(java.util.Date.from(java.time.LocalDate.parse("2026-10-01").atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant()));
            String sql=RecipeRecordMapper.class.getMethod("insert",RecipeRecord.class).getAnnotation(org.apache.ibatis.annotations.Insert.class).value()[0];
            org.apache.ibatis.session.Configuration config=new org.apache.ibatis.session.Configuration();
            org.apache.ibatis.mapping.BoundSql bound=new org.apache.ibatis.builder.SqlSourceBuilder(config).parse(sql,RecipeRecord.class,new java.util.HashMap<>()).getBoundSql(body);
            org.apache.ibatis.mapping.MappedStatement statement=new org.apache.ibatis.mapping.MappedStatement.Builder(config,"day",new org.apache.ibatis.builder.StaticSqlSource(config,bound.getSql(),bound.getParameterMappings()),org.apache.ibatis.mapping.SqlCommandType.INSERT).build();
            java.sql.PreparedStatement jdbc=mock(java.sql.PreparedStatement.class);
            new org.apache.ibatis.scripting.defaults.DefaultParameterHandler(statement,body,bound).setParameters(jdbc);
            verify(jdbc).setString(2,"2026-10-01");
            verify(jdbc,never()).setDate(anyInt(),any(java.sql.Date.class));
            assertEquals("2026-10-01",new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(body)).get("recordDate").asText());
        } finally { java.util.TimeZone.setDefault(previous); }
    }
    @Test void deletedSlotStillRejectsStaleCreationAndRequestRemainsUnchanged() {
        MealConsumptionMapper logs=mock(MealConsumptionMapper.class);
        RecipeRecordMapper plans=mock(RecipeRecordMapper.class);
        when(logs.lockUser(1L)).thenReturn(1L);when(logs.request(anyLong(),anyString())).thenReturn(null);
        RecipeRecord slot=new RecipeRecord();slot.setRevision(7L);slot.setIsDeleted(true);
        when(plans.findSlot(1L,"2026-10-01","dinner")).thenReturn(slot);
        MealPlanService service=new MealPlanService(mock(RecipeRecordService.class),plans,logs,new ObjectMapper());
        RecipeRecord body=new RecipeRecord();body.setRequestId("p-one");body.setExpectedRevision(0L);body.setRecipeName("鱼");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.mutate(1L,"2026-10-01","dinner",body,false));
        body.setExpectedRevision(7L);service.mutate(1L,"2026-10-01","dinner",body,false);
        assertNull(body.getUserId());assertNull(body.getRecordDate());assertNull(body.getTargetPeople());
    }
}
