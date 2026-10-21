package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.session.Configuration;
import org.mybatis.spring.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in only, against the disposable server created by run_mysql_integration.py. */
class RecommendationLearningMysqlIT {
    JdbcTemplate sql;TransactionTemplate tx;RecommendationLearningService learning;RecommendationFeedbackMapper feedback;MealConsumptionMapper users;
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("V4_TEST_JDBC");assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_v4_test_[a-z0-9]+\\?.*"));
        DriverManagerDataSource source=new DriverManagerDataSource(url,"root",System.getenv("V4_TEST_PASSWORD"));source.setDriverClassName("com.mysql.cj.jdbc.Driver");sql=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        Configuration config=new Configuration();config.setMapUnderscoreToCamelCase(true);config.addMapper(RecommendationFeedbackMapper.class);config.addMapper(MealConsumptionMapper.class);config.addMapper(DishMapper.class);
        SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(config);SqlSessionTemplate session=new SqlSessionTemplate(factory.getObject());
        feedback=session.getMapper(RecommendationFeedbackMapper.class);users=session.getMapper(MealConsumptionMapper.class);
        learning=new RecommendationLearningService(feedback,users,tx,new ObjectMapper(),new RecommendationMetadataService(session.getMapper(DishMapper.class)));
        sql.update("INSERT IGNORE INTO users(id,open_id) VALUES(700001,'learning-test-a'),(700002,'learning-test-b')");
        sql.update("DELETE FROM recommendation_feedback WHERE user_id IN (700001,700002)");sql.update("DELETE FROM recommendation_learning_reset WHERE user_id IN (700001,700002)");
    }
    MealWorkspace workspace(){MealWorkspace w=new MealWorkspace();w.setId("learning-test");MealContext c=new MealContext();c.setDate("2026-10-21");w.setContext(c);Dish d=new Dish();d.setId(17L);d.setName("清炒时蔬");d.setTagCodes("LIGHT");w.getDraft().setPlanVersion(1L);w.getDraft().setDishes(Collections.singletonList(d));return w;}
    void record(long user,MealWorkspace w,String type){tx.execute(s->{users.lockUser(user);learning.record(user,w,type,w.getDraft().getDishes());return null;});}
    int count(long user){return sql.queryForObject("SELECT COUNT(*) FROM recommendation_feedback WHERE user_id=? AND revoked=0",Integer.class,user);}
    @Test void duplicateAndConcurrentAcknowledgementsUseOneOpportunityPerMealDish() throws Exception {
        MealWorkspace w=workspace();ExecutorService pool=Executors.newFixedThreadPool(2);
        try{Future<?> a=pool.submit(()->record(700001,w,"exposed")),b=pool.submit(()->record(700001,w,"exposed"));a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        record(700001,w,"accepted");record(700001,w,"accepted");record(700001,w,"favorite");record(700001,w,"regenerate");
        assertEquals(2,count(700001));assertEquals(2,feedback.recent(700001L,"2020-01-01T00:00:00.000Z").size());assertTrue(learning.weights(700001L).isEmpty());
    }
    @Test void resetIsAccountScopedAndReplayingItDoesNotEraseNewFeedback(){
        MealWorkspace w=workspace();record(700001,w,"exposed");record(700002,w,"exposed");learning.reset(700001L,"reset-learning-one");assertEquals(0,count(700001));assertEquals(1,count(700002));
        w.getContext().setMealType("dinner");record(700001,w,"exposed");learning.reset(700001L,"reset-learning-one");assertEquals(1,count(700001));
        learning.reset(700001L,"reset-learning-two");assertEquals(0,count(700001));assertEquals(1,count(700002));
    }
    @Test void rollbackAndUndoCancelOnlyTheirCorrespondingFeedback(){
        MealWorkspace w=workspace();assertThrows(IllegalStateException.class,()->tx.execute(s->{learning.record(700001L,w,"exposed",w.getDraft().getDishes());throw new IllegalStateException("simulate failed business commit");}));assertEquals(0,count(700001));
        record(700001,w,"exposed");w.getDraft().setPlanVersion(2L);record(700001,w,"single_replaced");assertEquals(2,count(700001));
        // An intervening keep/undo can renumber the restored draft. The feedback identity remains 2.
        w.getDraft().setPlanVersion(4L);tx.execute(s->{learning.undo(700001L,w);return null;});assertEquals(1,count(700001));
        w.setId("restored-learning-workspace");w.getDraft().setPlanVersion(5L);record(700001,w,"single_replaced");assertEquals(2,count(700001));
        assertEquals(5L,sql.queryForObject("SELECT plan_version FROM recommendation_feedback WHERE user_id=700001 AND event_type='single_replaced'",Long.class));
        learning.undo(700001L,w);assertEquals(1,count(700001));
    }
}
