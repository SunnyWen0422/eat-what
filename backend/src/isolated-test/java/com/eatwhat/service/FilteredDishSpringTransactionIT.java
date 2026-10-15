package com.eatwhat.service;

import com.eatwhat.dto.DishPageDTO;
import com.eatwhat.dto.RecommendationCriteria;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.*;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.SystemMetaObject;
import org.apache.ibatis.session.*;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import javax.sql.DataSource;
import java.sql.*;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in synthetic database test: never include in default application/test scanning. */
@EnabledIfEnvironmentVariable(named="EATWHAT_F2_MYSQL_TEST",matches="1")
public class FilteredDishSpringTransactionIT {
 @org.springframework.context.annotation.Configuration @EnableTransactionManagement(proxyTargetClass=true)
 static class Context {
  @Bean DataSource dataSource(){
   String url=System.getenv("EATWHAT_F2_JDBC_URL");
   if(url==null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/f2_aop_test\\?.*"))throw new IllegalArgumentException("Dedicated loopback f2_aop_test database required");
   UnpooledDataSource ds=new UnpooledDataSource("com.mysql.cj.jdbc.Driver",url,"root",System.getenv("EATWHAT_F2_DB_PASSWORD"));
   ds.setDefaultTransactionIsolationLevel(Connection.TRANSACTION_READ_COMMITTED);return ds;
  }
  @Bean DataSourceTransactionManager transactionManager(DataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean Audit audit(DataSource ds){return new Audit(ds);}
  @Bean SqlSessionFactory sqlSessionFactory(DataSource ds,Audit audit){
   org.apache.ibatis.session.Configuration c=new org.apache.ibatis.session.Configuration(new Environment("isolated-f2",new SpringManagedTransactionFactory(),ds));
   c.setLocalCacheScope(LocalCacheScope.SESSION);c.addInterceptor(audit);c.addMapper(DishMapper.class);c.addMapper(DishQualityMapper.class);return new SqlSessionFactoryBuilder().build(c);
  }
  @Bean SqlSessionTemplate sqlSession(SqlSessionFactory factory){return new SqlSessionTemplate(factory);}
  @Bean DishMapper dishMapper(SqlSessionTemplate session){return session.getMapper(DishMapper.class);}
  @Bean DishQualityMapper qualityMapper(SqlSessionTemplate session){return session.getMapper(DishQualityMapper.class);}
  @Bean DishQualityService quality(DishQualityMapper mapper){return new DishQualityService(mapper,new ObjectMapper());}
  @Bean DishCandidateQueryService candidates(DishMapper mapper){return new DishCandidateQueryService(mapper);}
  @Bean DishQueryService dishes(DishMapper mapper,DishCandidateQueryService candidates){return new DishQueryService(mapper,candidates);}
 }
 @Intercepts(@Signature(type=Executor.class,method="query",args={MappedStatement.class,Object.class,RowBounds.class,ResultHandler.class}))
 public static class Audit implements Interceptor {
  List<Long> detailIds; final DataSource ds; boolean mutate=true; int counts,facts,details,quality,maxEntries,maxRows,txChecks; final Set<Connection> connections=Collections.newSetFromMap(new IdentityHashMap<Connection,Boolean>());
  Audit(DataSource ds){this.ds=ds;}
  public Object plugin(Object target){return Plugin.wrap(target,this);}public void setProperties(Properties p){}
  public Object intercept(Invocation in)throws Throwable {
   Executor executor=(Executor)in.getTarget();Connection c=executor.getTransaction().getConnection();connections.add(c);
   assertTrue(TransactionSynchronizationManager.isActualTransactionActive());assertTrue(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
   assertEquals(Integer.valueOf(Connection.TRANSACTION_REPEATABLE_READ),TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());
   assertEquals(Connection.TRANSACTION_REPEATABLE_READ,c.getTransactionIsolation());assertTrue(c.isReadOnly());assertFalse(c.getAutoCommit());
   try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT @@transaction_isolation,@@transaction_read_only")){assertTrue(r.next());assertEquals("REPEATABLE-READ",r.getString(1));assertEquals(1,r.getInt(2));}txChecks++;
   MappedStatement ms=(MappedStatement)in.getArgs()[0];String name=ms.getId();Map<?,?> args=(Map<?,?>)in.getArgs()[1];
   if(mutate&&(name.endsWith("selectFilteredPageDetails")||name.endsWith("selectFilteredDishesPage")))external("UPDATE food SET STEP_IMAGES='changed-before-details' WHERE ID=3406");
   List<?> rows=(List<?>)in.proceed();
   Object base=SystemMetaObject.forObject(executor).hasGetter("delegate")?SystemMetaObject.forObject(executor).getValue("delegate"):executor;
   Map<?,?> cache=(Map<?,?>)SystemMetaObject.forObject(base).getValue("localCache.cache");int retained=0;for(Object value:cache.values())if(value instanceof List)retained+=((List<?>)value).size();
   maxEntries=Math.max(maxEntries,cache.size());maxRows=Math.max(maxRows,retained);
   if(name.endsWith("selectFilteredCandidateFacts")) {
    facts++;assertTrue(rows.size()<=256);assertEquals(1,cache.size());assertEquals(rows.size(),retained);
    String projection=ms.getBoundSql(args).getSql().toUpperCase(Locale.ROOT).split("FROM")[0];for(String heavy:Arrays.asList("STEP","IMAGE","TIPS","METHODS"))assertFalse(projection.contains(heavy));
    if(mutate&&facts==1){external("DELETE FROM food WHERE ID=1", "UPDATE food SET IMAGE='changed-after-first-batch' WHERE ID=3407", "INSERT INTO food (ID,NAME,IS_PUBLISHED) VALUES(0,'new-low',1),(4000,'new-high',1)");}
   } else if(name.endsWith("countFilteredDishes")){ counts++; if(mutate)external("DELETE FROM food WHERE ID=1", "UPDATE food SET IMAGE='changed-after-first-batch' WHERE ID=3407", "INSERT INTO food (ID,NAME,IS_PUBLISHED) VALUES(0,'new-low',1),(4000,'new-high',1)");
   } else if(name.endsWith("selectFilteredPageDetails")||name.endsWith("selectFilteredDishesPage")){details++;detailIds=name.endsWith("selectFilteredDishesPage")?rows.stream().map(r->((Dish)r).getId()).collect(Collectors.toList()):new ArrayList<>((List<Long>)args.get("ids"));assertEquals(new HashSet<>(detailIds),rows.stream().map(r->((Dish)r).getId()).collect(Collectors.toSet()));assertEquals(37,rows.size());if(args.containsKey("ids"))assertEquals(37,((List<?>)args.get("ids")).size());assertTrue(cache.size()<=2);assertTrue(retained<=293);}
   else if(name.endsWith("DishQualityMapper.find")){quality++;assertEquals(new HashSet<>(detailIds),new HashSet<>((List<Long>)args.get("ids")));assertEquals(37,((List<?>)args.get("ids")).size());assertEquals(0,rows.size());assertTrue(cache.size()<=3);}
   else fail("Unexpected mapper: "+name);
   return rows;
  }
  void external(String... sql)throws SQLException{try(Connection c=ds.getConnection();Statement s=c.createStatement()){assertTrue(c.getAutoCommit());for(String q:sql)s.executeUpdate(q);}}
 }
 @Test void actualAnnotationProxyKeepsSnapshotAndBoundedSessionCache()throws Exception { verifySnapshot(true); }
 @Test void ordinaryCountAndPageStayFastAndUseTheSameSnapshot()throws Exception { verifySnapshot(false); }
 void verifySnapshot(boolean complex)throws Exception {
  try(AnnotationConfigApplicationContext context=new AnnotationConfigApplicationContext(Context.class)) {
   DataSource ds=context.getBean(DataSource.class);fixture(ds);DishQueryService service=context.getBean(DishQueryService.class);Audit audit=context.getBean(Audit.class);
   assertTrue(AopUtils.isCglibProxy(service));assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
   RecommendationCriteria criteria=new RecommendationCriteria(); if(complex)criteria.setExcludedIngredients(Collections.singletonList("not-present-in-synthetic-facts"));
   DishPageDTO first=service.getFilteredDishes(7L,null,null,criteria,1,37);
   assertEquals(3407,first.getTotal());assertEquals(37,first.getList().size());for(int i=0;i<37;i++){
    Dish d=first.getList().get(i);assertEquals(3407L-i,d.getId().longValue());assertEquals("image-"+d.getId(),d.getImage());assertEquals("steps-"+d.getId(),d.getSteps());assertEquals("step-images-"+d.getId(),d.getStepImages());assertEquals("tips-"+d.getId(),d.getTips());
   }
   assertEquals(complex?14:0,audit.facts);assertEquals(complex?0:1,audit.counts);assertEquals(1,audit.details);assertEquals(1,audit.quality);assertEquals(1,audit.connections.size());assertTrue(audit.maxRows<=293);assertTrue(audit.maxEntries<=3);assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
   int firstFacts=audit.facts,firstChecks=audit.txChecks,firstMaxRows=audit.maxRows;audit.mutate=false;
   DishPageDTO next=service.getFilteredDishes(7L,null,null,criteria,1,37);assertEquals(3408,next.getTotal());assertEquals(4000L,next.getList().get(0).getId().longValue());
   Map<Long,Dish> byId=next.getList().stream().collect(Collectors.toMap(Dish::getId,d->d));assertEquals("changed-after-first-batch",byId.get(3407L).getImage());assertEquals("changed-before-details",byId.get(3406L).getStepImages());assertEquals(2,audit.connections.size());
   System.out.println("F2_AOP_MYSQL_PASS complex="+complex+" proxy=CGLIB annotationTransaction=readOnly/REPEATABLE_READ serverReadOnly=1 firstTotal=3407 nextTotal=3408 firstFactBatches="+firstFacts+" firstTransactionChecks="+firstChecks+" maxCachedRows="+firstMaxRows+" maxCacheEntries="+audit.maxEntries+" detailsPerCall=37 qualityIdsPerCall=37");
  }
 }
 static void fixture(DataSource ds)throws Exception {
  try(Connection c=ds.getConnection();Statement s=c.createStatement()) {
   assertEquals(Connection.TRANSACTION_READ_COMMITTED,c.getTransactionIsolation());
   s.execute("DROP TABLE IF EXISTS dish_quality_profile");s.execute("DROP TABLE IF EXISTS food");
   s.execute("CREATE TABLE food (ID BIGINT PRIMARY KEY,NAME VARCHAR(100),TYPE VARCHAR(20),CL TEXT,FL TEXT,STEP LONGTEXT,STEPS LONGTEXT,STEP_IMAGES LONGTEXT,TIPS LONGTEXT,TAGS TEXT,IMAGE LONGTEXT,DIFFICULTY VARCHAR(20),COOK_TIME VARCHAR(20),INGREDIENTS_AMOUNTS TEXT,METHODS TEXT,KCAL INT,CUISINE_CODE VARCHAR(30),TAG_CODES TEXT,COOK_MINUTES INT,METADATA_VERSION INT,user_id BIGINT,IS_PUBLISHED INT,is_custom INT,create_time DATETIME) ENGINE=InnoDB");
   s.execute("CREATE TABLE dish_quality_profile(dish_id BIGINT PRIMARY KEY, profile_json LONGTEXT) ENGINE=InnoDB");
   try(PreparedStatement p=c.prepareStatement("INSERT INTO food (ID,NAME,IMAGE,STEPS,STEP_IMAGES,TIPS,IS_PUBLISHED) VALUES(?,?,?,?,?,?,1)")){for(int i=1;i<=3407;i++){p.setLong(1,i);p.setString(2,"synthetic-"+i);p.setString(3,"image-"+i);p.setString(4,"steps-"+i);p.setString(5,"step-images-"+i);p.setString(6,"tips-"+i);p.addBatch();}p.executeBatch();}
  }
 }
}
