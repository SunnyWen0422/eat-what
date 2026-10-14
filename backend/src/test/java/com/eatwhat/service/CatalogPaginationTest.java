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
        DishMapper mapper=mock(DishMapper.class);List<Dish> lastPage=new ArrayList<>();for(long i=100;i>=1;i--){Dish d=new Dish();d.setId(i);lastPage.add(d);}
        when(mapper.countFilteredDishes(eq(7L),eq("meat"),isNull(),anyList(),anyList(),isNull())).thenReturn(3200);
        when(mapper.selectFilteredDishesPage(eq(7L),eq("meat"),isNull(),anyList(),anyList(),isNull(),eq(100),eq(3100L))).thenReturn(lastPage);
        DishQueryService query=new DishQueryService(mapper);DishPageDTO result=query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),32,100);
        assertEquals(3200,result.getTotal());assertEquals(100,result.getList().size());
        assertEquals(0,query.getFilteredDishes(7L,"meat",null,new RecommendationCriteria(),Integer.MAX_VALUE,100).getList().size());
    }
}
