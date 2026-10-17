package com.eatwhat.service;

import com.eatwhat.mapper.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.controller.DishController;
import org.junit.jupiter.api.*;
import org.apache.ibatis.session.Configuration;
import org.mybatis.spring.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Explicitly selected only against a fresh owned loopback instance. No application configuration loads. */
class ReviewFixSqlIT {
 private JdbcTemplate sql; private MealWorkspaceMapper tasks; private DishMapper food;
 @BeforeEach void setup() throws Exception {
  String url=System.getenv("REVIEW_TEST_JDBC");assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_review_[a-z0-9]+\\?.*"));
  DriverManagerDataSource source=new DriverManagerDataSource(url,"root",System.getenv("REVIEW_TEST_PASSWORD"));source.setDriverClassName("com.mysql.cj.jdbc.Driver");sql=new JdbcTemplate(source);
  Configuration config=new Configuration();config.setMapUnderscoreToCamelCase(true);config.addMapper(MealWorkspaceMapper.class);config.addMapper(DishMapper.class);
  SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(config);SqlSessionTemplate session=new SqlSessionTemplate(factory.getObject());tasks=session.getMapper(MealWorkspaceMapper.class);food=session.getMapper(DishMapper.class);
  sql.execute("CREATE TABLE IF NOT EXISTS workspace_task(id INT PRIMARY KEY AUTO_INCREMENT,status VARCHAR(30),input_json JSON,created_at DATETIME)");
  sql.execute("DELETE FROM workspace_task");
  sql.execute("CREATE TABLE IF NOT EXISTS food(ID INT PRIMARY KEY AUTO_INCREMENT,NAME VARCHAR(255),TYPE VARCHAR(20),CL TEXT,FL TEXT,STEP TEXT,INGREDIENTS_AMOUNTS TEXT,STEPS TEXT,STEP_IMAGES TEXT,TIPS TEXT,TAGS TEXT,CUISINE_CODE TEXT,TAG_CODES TEXT,COOK_MINUTES INT,METADATA_VERSION TEXT,IMAGE TEXT,DIFFICULTY TEXT,COOK_TIME TEXT,METHODS TEXT,KCAL TEXT,user_id BIGINT,is_custom INT,create_time DATETIME,IS_PUBLISHED INT)");sql.execute("DELETE FROM food");
 }
 @Test void terminalInputPurgeProgressesAcrossMoreThanTwoBatchesAndPreservesActiveAndRecent(){
  for(int i=0;i<1201;i++)sql.update("INSERT INTO workspace_task(status,input_json,created_at) VALUES('completed','{\"private\":1}',DATE_SUB(NOW(),INTERVAL 31 DAY))");
  for(String state:Arrays.asList("queued","running"))sql.update("INSERT INTO workspace_task(status,input_json,created_at) VALUES(?,'{\"private\":1}',DATE_SUB(NOW(),INTERVAL 31 DAY))",state);
  sql.update("INSERT INTO workspace_task(status,input_json,created_at) VALUES('failed','{\"private\":1}',DATE_SUB(NOW(),INTERVAL 29 DAY))");
  for(int remaining:new int[]{701,201,0}){int changed=tasks.purgeTaskInputs();assertTrue(changed>0&&changed<=500);assertEquals(remaining,sql.queryForObject("SELECT COUNT(*) FROM workspace_task WHERE status='completed' AND JSON_LENGTH(input_json)>0",Integer.class));}
  assertEquals(0,tasks.purgeTaskInputs());assertEquals(3,sql.queryForObject("SELECT COUNT(*) FROM workspace_task WHERE JSON_LENGTH(input_json)>0",Integer.class));
 }
 private void catalog(){for(int i=0;i<205;i++)sql.update("INSERT INTO food(NAME,TYPE,user_id,IS_PUBLISHED) VALUES(?, ?, NULL,1)","青菜"+i,i%2==0?"veg":"meat");sql.update("INSERT INTO food(NAME,TYPE,user_id,IS_PUBLISHED) VALUES('青菜私有','veg',9,1),('青菜未发布','veg',NULL,0)");}
 @Test void legacyBroadAndEmptySearchRetainListShapeAndBoundDatabaseRead(){
  catalog();DishQueryService query=new DishQueryService(food);DishController controller=new DishController(query,mock(CustomDishService.class));MockHttpServletRequest request=new MockHttpServletRequest();
  assertEquals(401,controller.searchDishes("青菜",null,request).getStatusCodeValue());
  request.setAttribute("currentUserId",1L);List<Dish> found=controller.searchDishes("青菜",null,request).getBody();assertNotNull(found);assertEquals(100,found.size());assertTrue(found.stream().allMatch(d->d.getUserId()==null&&!d.getName().contains("未发布")));
  assertTrue(controller.searchDishes("",null,request).getBody().size()<=100);assertEquals(100,food.searchDishesByKeyword("%").size());
 }
 @Test void legacyTypedSearchKeepsNormalMatchingAndPublicVisibility(){
  catalog();DishQueryService query=new DishQueryService(food);List<Dish> found=query.searchDishes("青菜","veg");assertEquals(100,found.size());assertTrue(found.stream().allMatch(d->"veg".equals(d.getType())&&d.getUserId()==null&&!d.getName().contains("未发布")));
  assertEquals(1,query.searchDishes("青菜204","veg").size());assertTrue(query.searchDishes("青菜204","meat").isEmpty());
 }
}
