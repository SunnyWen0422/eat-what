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
        DishCandidateQueryService candidates=mock(DishCandidateQueryService.class);List<Dish> all=new ArrayList<>();for(long i=1;i<=3200;i++){Dish d=new Dish();d.setId(i);all.add(d);}
        when(candidates.findRawForUser(anyLong(),any(),any(),any(),anyInt())).thenAnswer(inv->new ArrayList<>(all.subList(0,Math.min(all.size(),inv.getArgument(4)))));
        DishQueryService query=new DishQueryService(mock(DishMapper.class),candidates);DishPageDTO result=query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),32,100);
        assertEquals(3200,result.getTotal());assertEquals(100,result.getList().size());
        assertEquals(0,query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),Integer.MAX_VALUE,100).getList().size());
    }
}
