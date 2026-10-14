package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.dto.*;
import com.eatwhat.mapper.DishMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CatalogPaginationTest {
    @Test void categoryPaginationBindsRealMapperArguments()throws Exception{
        org.apache.ibatis.session.Configuration config=new org.apache.ibatis.session.Configuration();config.addMapper(DishMapper.class);
        java.lang.reflect.Method method=DishMapper.class.getMethod("selectDishesByTypePage",String.class,int.class,int.class);
        Object parameters=new org.apache.ibatis.reflection.ParamNameResolver(config,method).getNamedParams(new Object[]{"veg",100,200});
        org.apache.ibatis.mapping.MappedStatement statement=config.getMappedStatement(DishMapper.class.getName()+".selectDishesByTypePage");
        java.sql.PreparedStatement prepared=mock(java.sql.PreparedStatement.class);
        new org.apache.ibatis.scripting.defaults.DefaultParameterHandler(statement,parameters,statement.getBoundSql(parameters)).setParameters(prepared);
        verify(prepared).setInt(2,100);verify(prepared).setInt(3,200);
    }
    @Test void completePublicCatalogIsNotTruncatedToFourHundredOrTwoThousand(){
        List<Dish> all=new ArrayList<>();for(long i=3200;i>0;i--){Dish d=new Dish();d.setId(i);all.add(d);}
        DishMapper mapper=mock(DishMapper.class);
        when(mapper.selectFilteredCandidateFacts(anyLong(),any(),any(),anyList(),anyList(),any(),any(),anyInt())).thenAnswer(inv->{
            Long before=inv.getArgument(6);int limit=inv.getArgument(7);
            return all.stream().filter(d->before==null||d.getId()<before).limit(limit).collect(java.util.stream.Collectors.toList());
        });
        when(mapper.selectFilteredPageDetails(anyList(),eq(7L))).thenAnswer(inv->{List<Long> ids=inv.getArgument(0);return all.stream().filter(d->ids.contains(d.getId())).collect(java.util.stream.Collectors.toList());});
        DishQueryService query=new DishQueryService(mapper);DishPageDTO result=query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),32,100);
        assertEquals(3200,result.getTotal());assertEquals(100,result.getList().size());
        assertEquals(100L,result.getList().get(0).getId());assertEquals(1L,result.getList().get(99).getId());
        assertEquals(0,query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),Integer.MAX_VALUE,100).getList().size());
        verify(mapper,never()).selectFilteredCandidates(any(),any(),any(),any(),any(),any());
    }
}
