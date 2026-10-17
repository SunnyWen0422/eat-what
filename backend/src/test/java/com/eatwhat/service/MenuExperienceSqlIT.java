package com.eatwhat.service;
import com.eatwhat.mapper.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.dto.*;
import org.junit.jupiter.api.*;
import org.apache.ibatis.session.Configuration;
import org.mybatis.spring.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
/** Selected only by the fresh owned loopback runner; no application configuration. */
class MenuExperienceSqlIT {
 private JdbcTemplate sql;private MealWorkspaceMapper tasks;private DishMapper food;private AssistantV4Mapper history;
 @BeforeEach void setup() throws Exception {
  String url=System.getenv("REVIEW_TEST_JDBC");assertNotNull(url);assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_review_[a-z0-9]+\\?.*"));
  DriverManagerDataSource source=new DriverManagerDataSource(url,"root",System.getenv("REVIEW_TEST_PASSWORD"));source.setDriverClassName("com.mysql.cj.jdbc.Driver");sql=new JdbcTemplate(source);
  Configuration config=new Configuration();config.setMapUnderscoreToCamelCase(true);config.addMapper(MealWorkspaceMapper.class);config.addMapper(DishMapper.class);config.addMapper(AssistantV4Mapper.class);
  SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(config);SqlSessionTemplate session=new SqlSessionTemplate(factory.getObject());tasks=session.getMapper(MealWorkspaceMapper.class);food=session.getMapper(DishMapper.class);history=session.getMapper(AssistantV4Mapper.class);
  sql.execute("CREATE TABLE IF NOT EXISTS workspace_task(id INT PRIMARY KEY AUTO_INCREMENT,status VARCHAR(30),input_json JSON,created_at DATETIME)");
  sql.execute("DELETE FROM workspace_task");
  sql.execute("CREATE TABLE IF NOT EXISTS food(ID INT PRIMARY KEY AUTO_INCREMENT,NAME VARCHAR(255),TYPE VARCHAR(20),CL TEXT,FL TEXT,STEP TEXT,INGREDIENTS_AMOUNTS TEXT,STEPS TEXT,STEP_IMAGES TEXT,TIPS TEXT,TAGS TEXT,CUISINE_CODE TEXT,TAG_CODES TEXT,COOK_MINUTES INT,METADATA_VERSION TEXT,IMAGE TEXT,DIFFICULTY TEXT,COOK_TIME TEXT,METHODS TEXT,KCAL TEXT,user_id BIGINT,is_custom INT,create_time DATETIME,IS_PUBLISHED INT)");sql.execute("DELETE FROM food");
 }

 @Test void hanCountAndPageMatchExistingJavaExclusionForNullAndCrossFieldCases(){
  String[][] values={{"香菜",null},{"香","菜"},{null,null},{"青菜","香菜少许"},{"青菜","花生"},{"PEANUT","青菜"}};
  for(int i=0;i<values.length;i++)sql.update("INSERT INTO food(ID,NAME,TYPE,CL,INGREDIENTS_AMOUNTS,user_id,IS_PUBLISHED) VALUES(?,?,'veg',?,?,NULL,1)",i+1,"菜"+(i+1),values[i][0],values[i][1]);
  sql.update("INSERT INTO food(ID,NAME,TYPE,CL,user_id,IS_PUBLISHED) VALUES(20,'私有','veg','青菜',8,1),(21,'未发布','veg','青菜',NULL,0)");
  DishCandidateQueryService service=new DishCandidateQueryService(food);RecommendationCriteria c=new RecommendationCriteria();c.setExcludedIngredients(Arrays.asList("香菜","花生"));
  List<Long> expected=service.findRawForUser(7L,null,null,c,100).stream().map(Dish::getId).collect(Collectors.toList());
  DishPageDTO first=service.findRawPageForUser(7L,null,null,c,1,2),second=service.findRawPageForUser(7L,null,null,c,2,2);
  List<Long> actual=new ArrayList<>();first.getList().forEach(d->actual.add(d.getId()));second.getList().forEach(d->actual.add(d.getId()));
  assertEquals(expected,actual);assertEquals(expected.size(),first.getTotal());assertTrue(actual.contains(2L));assertFalse(actual.contains(20L));assertFalse(actual.contains(21L));
  c.setExcludedIngredients(Arrays.asList("香菜","peanut"));assertEquals(service.findRawForUser(7L,null,null,c,100).size(),service.findRawPageForUser(7L,null,null,c,1,10).getTotal());
 }
 @Test void selectedQueryPreservesHardSqlPredicatesAndPrivateVisibility(){
  sql.update("INSERT INTO food(ID,NAME,TYPE,CL,CUISINE_CODE,TAG_CODES,COOK_MINUTES,user_id,IS_PUBLISHED) VALUES(1,'菜一','veg','青菜','HOME','LIGHT',10,NULL,1),(2,'菜二','veg','花生','HOME','LIGHT',15,NULL,1),(3,'别人菜','veg','青菜','HOME','LIGHT',10,8,1),(4,'未发布','veg','青菜','HOME','LIGHT',10,NULL,0),(5,'自己菜','veg','青菜','HOME','LIGHT',10,7,0)");
  RecommendationCriteria c=new RecommendationCriteria();c.setCuisineCodes(Collections.singletonList("HOME"));c.setIncludeTagCodes(Collections.singletonList("LIGHT"));c.setMaxCookMinutes(12);c.setExcludedIngredients(Collections.singletonList("花生"));
  DishCandidateQueryService service=new DishCandidateQueryService(food);List<Long> actual=service.findSelectedForUser(7L,Arrays.asList(5L,1L,2L,3L,4L),c).stream().map(Dish::getId).collect(Collectors.toList());assertEquals(Arrays.asList(5L,1L),actual);
 }
 @Test void boundedHistorySummariesAreDistinctScopedAndRespectTextRetention(){
  sql.execute("CREATE TABLE IF NOT EXISTS meal_workspace(id VARCHAR(100),user_id BIGINT,meal_date VARCHAR(10),meal_type VARCHAR(20),revision BIGINT,state_json JSON)");
  sql.execute("CREATE TABLE IF NOT EXISTS assistant_v4_session(id VARCHAR(100),user_id BIGINT,workspace_id VARCHAR(100),updated_at BIGINT)");
  sql.execute("CREATE TABLE IF NOT EXISTS assistant_v4_turn(id VARCHAR(100),user_id BIGINT,session_id VARCHAR(100),status VARCHAR(30),updated_at BIGINT)");
  sql.execute("CREATE TABLE IF NOT EXISTS assistant_v4_message(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT,session_id VARCHAR(100),role VARCHAR(20),text_content TEXT,created_at BIGINT)");
  long now=System.currentTimeMillis();String[] questions={"换一道素菜","保存明晚菜单","准备食材"};String[] statuses={"completed","awaiting_confirmation","partially_completed"};
  for(int i=0;i<3;i++){String id="session-"+i;sql.update("INSERT INTO meal_workspace VALUES(?,7,'2026-10-17','dinner',1,'{\"draft\":{\"planVersion\":1}}')","w"+i);sql.update("INSERT INTO assistant_v4_session VALUES(?,7,?,?)",id,"w"+i,now+i);sql.update("INSERT INTO assistant_v4_turn VALUES(?,7,?,?,?)","t"+i,id,statuses[i],now+i);sql.update("INSERT INTO assistant_v4_message(user_id,session_id,role,text_content,created_at) VALUES(?,?,'user',?,?)",7,id,questions[i],now);}
  sql.update("INSERT INTO assistant_v4_message(user_id,session_id,role,text_content,created_at) VALUES(7,'session-0','user','过期内容',?)",now-31L*86400000);
  sql.update("INSERT INTO assistant_v4_session VALUES('private-session',8,'private-w',?)",now+9);
  List<com.eatwhat.dto.AssistantV4Contract.SessionSummary> rows=history.sessions(7L,Long.MAX_VALUE,"~",4);assertEquals(3,rows.size());assertEquals(3,rows.stream().map(com.eatwhat.dto.AssistantV4Contract.SessionSummary::getTitle).distinct().count());assertFalse(rows.stream().anyMatch(r->"过期内容".equals(r.getTitle())||r.getUserId()!=7L));assertTrue(rows.stream().anyMatch(com.eatwhat.dto.AssistantV4Contract.SessionSummary::isHasPending));
 }
}
