package com.eatwhat.mapper;

import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.scripting.xmltags.XMLLanguageDriver;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PublicCatalogMapperContractTest {
    @Test void everyAnonymousFoodReadUsesTheSameStrictReleasePredicateAndBoundParameters() throws Exception {
        for(Method method : PublicCatalogMapper.class.getDeclaredMethods()) {
            Select query = method.getAnnotation(Select.class); assertNotNull(query,"Dedicated public reads need explicit SQL");
            String raw=String.join(" ",query.value()); assertFalse(raw.contains("${"));
            Map<String,Object> input=new HashMap<>(); input.put("ids",Arrays.asList(1L,2L)); input.put("type","veg"); input.put("id",1L); input.put("limit",50); input.put("offset",0);
            BoundSql bound=new XMLLanguageDriver().createSqlSource(new Configuration(),raw,Map.class).getBoundSql(input);
            String sql=bound.getSql().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
            assertTrue(sql.contains("user_id is null"),sql); assertTrue(sql.contains("is_custom = 0"),sql); assertTrue(sql.contains("is_published = 1"),sql); assertTrue(sql.contains("id in"),sql);
            assertFalse(sql.contains("coalesce"),sql); assertFalse(sql.matches(".*\\bor\\b.*"),sql); assertFalse(sql.contains("for update"),sql);
            assertEquals(2,bound.getParameterMappings().stream().filter(p -> p.getProperty().startsWith("__frch_")).count());
            if(method.getName().equals("list")) { assertTrue(sql.contains("limit ? offset ?"),sql); assertTrue(sql.contains("order by id"),sql); }
            if(method.getName().equals("detail")) assertTrue(sql.contains("id = ?"),sql);
            input.put("ids",Collections.emptyList()); String empty=new XMLLanguageDriver().createSqlSource(new Configuration(),raw,Map.class).getBoundSql(input).getSql();
            assertTrue(empty.contains("1 = 0"),"An empty release list must remain fail-closed at the SQL boundary");
        }
    }
}
