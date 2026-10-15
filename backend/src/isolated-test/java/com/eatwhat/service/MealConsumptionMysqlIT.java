package com.eatwhat.service;

import com.eatwhat.controller.MealConsumptionController;
import com.eatwhat.dto.MealConsumptionRequest;
import com.eatwhat.entity.*;
import com.eatwhat.exception.GlobalExceptionHandler;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.session.Configuration;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.junit.jupiter.api.*;
import org.springframework.aop.support.AopUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Explicit opt-in only: task-owned loopback MySQL, synthetic tables, no application/model boot. */
class MealConsumptionMysqlIT {
    private static final String DAY = "2026-01-01";
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate sql;
    private RecipeRecordMapper plans;
    private MealConsumptionMapper actuals;
    private MealConsumptionService service;
    private MockMvc mvc;
    private org.springframework.context.annotation.AnnotationConfigApplicationContext context;
    @org.springframework.context.annotation.Configuration
    @org.springframework.transaction.annotation.EnableTransactionManagement(proxyTargetClass=true)
    static class TransactionConfig {
        @org.springframework.context.annotation.Bean
        org.springframework.transaction.PlatformTransactionManager transactionManager(javax.sql.DataSource source) {
            return new DataSourceTransactionManager(source);
        }
    }
    @AfterEach void closeContext() { if (context != null) context.close(); }

    @BeforeEach void setup() throws Exception {
        Assumptions.assumeTrue("true".equals(System.getenv("MEAL_ACTUAL_TEST_ENABLED")), "Explicit opt-in required before any database access");
        String url = System.getenv("MEAL_ACTUAL_TEST_JDBC");
        assertNotNull(url,"Explicitly provision a disposable test container before selecting this IT");
        assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_actual_test_[a-z0-9]+\\?.*"));
        String password = System.getenv("MEAL_ACTUAL_TEST_PASSWORD");
        assertNotNull(password);
        DriverManagerDataSource ds = new DriverManagerDataSource(url,"root",password);
        ds.setDriverClassName("com.mysql.cj.jdbc.Driver");
        sql = new JdbcTemplate(ds);
        sql.execute("DROP TABLE IF EXISTS behavior_event");
        sql.execute("DROP TABLE IF EXISTS meal_workspace");
        sql.execute("DROP TABLE IF EXISTS meal_mutation_log");
        sql.execute("DROP TABLE IF EXISTS meal_consumption");
        sql.execute("DROP TABLE IF EXISTS recipe_records");
        sql.execute("DROP TABLE IF EXISTS users");
        sql.execute("CREATE TABLE users(id BIGINT PRIMARY KEY) ENGINE=InnoDB");
        sql.update("INSERT INTO users VALUES(1),(2)");
        sql.execute("CREATE TABLE recipe_records(ID BIGINT PRIMARY KEY AUTO_INCREMENT,USER_ID BIGINT,RECORD_DATE DATE,MEAL_TYPE VARCHAR(16),RECIPE_NAME VARCHAR(100),DISH_IDS TEXT,DISH_DETAILS TEXT,IS_MANUAL INT,CREATE_TIME DATETIME,UPDATE_TIME DATETIME,record_origin VARCHAR(16),target_people INT,revision BIGINT NOT NULL DEFAULT 1,is_deleted BOOLEAN NOT NULL DEFAULT FALSE,UNIQUE KEY slot(USER_ID,RECORD_DATE,MEAL_TYPE)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        sql.execute("CREATE TABLE meal_consumption(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id BIGINT NOT NULL,meal_date DATE NOT NULL,meal_type VARCHAR(16) NOT NULL,status VARCHAR(16) NOT NULL,revision BIGINT NOT NULL DEFAULT 1,source_record_id BIGINT NULL,planned_snapshot_json JSON NULL,actual_dishes_json JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_consumption(user_id,meal_date,meal_type)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        sql.execute("CREATE TABLE meal_mutation_log(user_id BIGINT NOT NULL,request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,response_json JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,request_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        sql.execute("CREATE TABLE meal_workspace(id VARCHAR(64) PRIMARY KEY,user_id BIGINT,meal_date DATE,meal_type VARCHAR(16),revision BIGINT,state_json JSON) ENGINE=InnoDB");
        sql.execute("CREATE TABLE behavior_event(event_id VARCHAR(64) PRIMARY KEY,user_id BIGINT,workspace_id VARCHAR(64),plan_version BIGINT,event_type VARCHAR(64),source VARCHAR(32),created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
        com.eatwhat.dto.MealWorkspace workspace = new com.eatwhat.dto.MealWorkspace(); workspace.setId("synthetic-workspace");
        sql.update("INSERT INTO meal_workspace VALUES(?,1,?,'dinner',0,?)", workspace.getId(),DAY,json.writeValueAsString(workspace));
        Configuration configuration = new Configuration();
        configuration.addMapper(RecipeRecordMapper.class); configuration.addMapper(MealConsumptionMapper.class);
        configuration.addMapper(DishMapper.class); configuration.addMapper(MealWorkspaceMapper.class);
        SqlSessionFactoryBean factory = new SqlSessionFactoryBean();
        factory.setDataSource(ds); factory.setConfiguration(configuration);
        SqlSessionTemplate session = new SqlSessionTemplate(factory.getObject());
        plans = session.getMapper(RecipeRecordMapper.class); actuals = session.getMapper(MealConsumptionMapper.class);
        MealConsumptionService target = new MealConsumptionService(actuals,plans,
                new DishQueryService(session.getMapper(DishMapper.class)),json,new DietReviewCalculator(json));
        MealBehaviorService behavior = new MealBehaviorService(session.getMapper(MealWorkspaceMapper.class),actuals,json,
                new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(ds)),true);
        // Minimal Spring context automatically discovers the service's @Transactional methods.
        // No component scan, application configuration, model, or Agent bean is registered.
        context = new org.springframework.context.annotation.AnnotationConfigApplicationContext();
        context.register(TransactionConfig.class);
        context.registerBean(javax.sql.DataSource.class,()->ds);
        context.registerBean(MealBehaviorService.class,()->behavior);
        context.registerBean(MealConsumptionService.class,()->target);
        context.refresh();
        service = context.getBean(MealConsumptionService.class);
        assertTrue(AopUtils.isAopProxy(service));
        mvc = MockMvcBuilders.standaloneSetup(new MealConsumptionController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    private void deletedPlan() {
        RecipeRecord p = new RecipeRecord(); p.setUserId(1L); p.setRecordDateString(DAY); p.setMealType("dinner");
        p.setRecipeName("已删除安排"); p.setDishIdsString("[]"); p.setDishDetailsString("[]"); p.setIsManual(1); p.setTargetPeople(2);
        assertEquals(1,plans.insert(p)); assertEquals(1,plans.deleteByDateAndMeal(1L,DAY,"dinner"));
        assertTrue(plans.selectByUserAndDate(1L,DAY).isEmpty());
        assertTrue(plans.findSlot(1L,DAY,"dinner").getIsDeleted());
        assertEquals(2L,plans.findSlot(1L,DAY,"dinner").getRevision());
    }
    private MealConsumptionRequest request(String id,long revision,long planRevision) {
        MealConsumptionRequest r = new MealConsumptionRequest(); r.setRequestId(id);
        r.setExpectedRevision(revision); r.setExpectedPlanRevision(planRevision); r.setStatus("eaten"); r.setUsePlan(false);
        MealConsumptionRequest.Entry entry = new MealConsumptionRequest.Entry(); entry.setName("外食面条");
        r.setDishes(Collections.singletonList(entry)); return r;
    }
    private MealConsumption save(MealConsumptionRequest r) { return service.save(1L,DAY,"dinner",r); }
    private int count(String table) { return sql.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }
    private void noActualOrReceipt() { assertNull(actuals.find(1L,DAY,"dinner")); assertEquals(0,count("meal_mutation_log")); assertEquals(0,count("behavior_event")); }

    @Test void tombstoneOverviewVersionAllowsFirstManualSaveAndCommitsReceipt() {
        deletedPlan(); Map<?,?> revisions = (Map<?,?>)service.overview(1L,DAY,DAY).get("planRevisions");
        MealConsumption saved = save(request("first-manual",0,(Long)revisions.get(DAY+"|dinner")));
        assertEquals(1L,saved.getRevision()); assertNull(saved.getSourceRecordId()); assertNull(saved.getPlannedSnapshot());
        // Separate connections outside the proxy transaction see both writes committed.
        MealConsumption persisted = service.hydrate(actuals.find(1L,DAY,"dinner"));
        assertEquals("外食面条",persisted.getActualDishes().get(0).get("name"));
        assertEquals(1,count("meal_consumption")); assertEquals(1,count("meal_mutation_log"));
        assertEquals(1,count("behavior_event"));
        assertEquals("actual_completed",sql.queryForObject("SELECT event_type FROM behavior_event",String.class));
        assertNotNull(actuals.request(1L,"first-manual")); assertNull(actuals.find(2L,DAY,"dinner"));
    }
    @Test void stalePlanAndActualRevisionsReturn409WithoutWrites() throws Exception {
        deletedPlan();
        mvc.perform(put("/meal-consumptions/"+DAY+"/dinner").requestAttr("currentUserId",1L)
                .contentType("application/json").content(json.writeValueAsString(request("stale-plan",0,1))))
                .andExpect(status().isConflict());
        noActualOrReceipt(); save(request("initial",0,2));
        mvc.perform(put("/meal-consumptions/"+DAY+"/dinner").requestAttr("currentUserId",1L)
                .contentType("application/json").content(json.writeValueAsString(request("stale-actual",0,2))))
                .andExpect(status().isConflict());
        assertEquals(1L,actuals.find(1L,DAY,"dinner").getRevision());
        assertEquals(1,count("meal_consumption")); assertEquals(1,count("meal_mutation_log"));
    }
    @Test void replayAfterPlanChangesReturnsReceiptWithoutSecondWrite() {
        deletedPlan(); MealConsumptionRequest r = request("replay",0,2); MealConsumption first = save(r);
        sql.update("UPDATE recipe_records SET revision=3 WHERE USER_ID=1");
        MealConsumption replay = save(r);
        assertEquals(first.getId(),replay.getId()); assertEquals(first.getActualDishes(),replay.getActualDishes());
        assertEquals(1L,replay.getRevision()); assertEquals(1,count("meal_mutation_log")); assertEquals(1,count("behavior_event"));
        r.setExpectedPlanRevision(3L); assertThrows(MealConsumptionService.VersionConflict.class,()->save(r));
        assertEquals(1L,actuals.find(1L,DAY,"dinner").getRevision());
    }
    @Test void deletedPlanCannotSupplyPlannedActualOrSnapshot() throws Exception {
        deletedPlan(); MealConsumptionRequest r = request("deleted-by-plan",0,2); r.setUsePlan(true);
        mvc.perform(put("/meal-consumptions/"+DAY+"/dinner").requestAttr("currentUserId",1L)
                .contentType("application/json").content(json.writeValueAsString(r)))
                .andExpect(status().isBadRequest());
        noActualOrReceipt();
    }
    private void failReceiptInsertion() {
        // The real mapper.save has already run when this database failure occurs.
        sql.execute("CREATE TRIGGER reject_receipt BEFORE INSERT ON meal_mutation_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic receipt failure'");
    }
    @Test void failedReceiptRollsBackFirstActualAndSameRequestCanRetry() {
        deletedPlan(); failReceiptInsertion(); MealConsumptionRequest r = request("rollback-first",0,2);
        assertThrows(org.springframework.dao.DataAccessException.class,()->save(r)); noActualOrReceipt();
        sql.execute("DROP TRIGGER reject_receipt");
        assertEquals(1L,save(r).getRevision()); assertEquals(1,count("meal_mutation_log"));
    }
    @Test void failedReceiptRollsBackExistingActualUpdate() {
        deletedPlan(); save(request("initial",0,2));
        String before = actuals.find(1L,DAY,"dinner").getActualDishesJson();
        failReceiptInsertion(); MealConsumptionRequest r = request("rollback-update",1,2);
        r.getDishes().get(0).setName("不应保存的新菜");
        assertThrows(org.springframework.dao.DataAccessException.class,()->save(r));
        assertEquals(1L,actuals.find(1L,DAY,"dinner").getRevision());
        assertEquals(before,actuals.find(1L,DAY,"dinner").getActualDishesJson());
        assertNull(actuals.request(1L,"rollback-update")); assertEquals(1,count("meal_mutation_log")); assertEquals(1,count("behavior_event"));
    }
    @Test void activePlanSnapshotPersistsThroughActualSave() {
        deletedPlan();
        sql.update("UPDATE recipe_records SET is_deleted=0,revision=3,RECIPE_NAME='当前安排' WHERE USER_ID=1");
        MealConsumptionRequest r = request("active-plan",0,3); r.setUsePlan(true);
        MealConsumption saved = save(r);
        assertNotNull(saved.getSourceRecordId());
        MealConsumption persisted = service.hydrate(actuals.find(1L,DAY,"dinner"));
        assertEquals("当前安排",persisted.getActualDishes().get(0).get("name"));
        assertEquals(true,persisted.getPlannedSnapshot().get("confirmedAsPlanned"));
        assertEquals(3,((Number)persisted.getPlannedSnapshot().get("revision")).intValue());
        assertEquals(1,count("meal_mutation_log")); assertEquals(1,count("behavior_event"));
    }
    @Test void failedDomainEventRollsBackActualBeforeReceipt() {
        deletedPlan();
        sql.execute("CREATE TRIGGER reject_event BEFORE INSERT ON behavior_event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic event failure'");
        IllegalStateException failure = assertThrows(IllegalStateException.class,()->save(request("event-failure",0,2)));
        assertEquals("业务事件保存失败",failure.getMessage()); noActualOrReceipt();
    }

}
