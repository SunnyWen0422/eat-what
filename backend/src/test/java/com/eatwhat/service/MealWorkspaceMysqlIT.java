package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.session.Configuration;
import org.mybatis.spring.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Runs only when explicitly selected by the private-server test script. */
class MealWorkspaceMysqlIT {
    private MealWorkspaceMapper db;
    private DishMapper food;
    private MealConsumptionMapper actual;
    private RecipeRecordMapper plans;
    private JdbcTemplate sql;
    private TransactionTemplate tx;
    private MealWorkspaceService service;
    private RecipeRecordService planService;
    private MealWorkspacePlanner planner;
    private final ObjectMapper json=new ObjectMapper();
    private final Dish dish=new Dish();

    @BeforeEach void setup() throws Exception {
        String url=System.getenv("V4_TEST_JDBC");
        assertNotNull(url,"Use scripts/run_mysql_integration.py");
        assertTrue(url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_v4_test_[a-z0-9]+\\?.*"));
        DriverManagerDataSource source=new DriverManagerDataSource(url,"root",System.getenv("V4_TEST_PASSWORD"));
        source.setDriverClassName("com.mysql.cj.jdbc.Driver");sql=new JdbcTemplate(source);
        tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        Configuration configuration=new Configuration();configuration.setMapUnderscoreToCamelCase(true);
        configuration.addMapper(DishMapper.class);configuration.addMapper(MealWorkspaceMapper.class);configuration.addMapper(MealConsumptionMapper.class);configuration.addMapper(RecipeRecordMapper.class);
        SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(configuration);
        SqlSessionTemplate session=new SqlSessionTemplate(factory.getObject());
        food=session.getMapper(DishMapper.class);db=session.getMapper(MealWorkspaceMapper.class);actual=session.getMapper(MealConsumptionMapper.class);plans=session.getMapper(RecipeRecordMapper.class);
        dish.setId(1L);dish.setName("测试菜");dish.setType("veg");dish.setCookMinutes(5);
        DishQueryService query=mock(DishQueryService.class);when(query.getDishesByIdsForUser(anyList(),anyLong())).thenReturn(Collections.singletonList(dish));
        planService=new RecipeRecordService(plans,query);planner=mock(MealWorkspacePlanner.class);
        service=new MealWorkspaceService(db,actual,plans,planService,planner,json,tx);
    }
    private WorkspaceRequest request(MealWorkspace w,String key) {
        WorkspaceRequest r=new WorkspaceRequest();r.setRequestId(key);r.setExpectedWorkspaceRevision(w.getRevision());r.setPlanVersion(w.getDraft().getPlanVersion());return r;
    }
    private MealWorkspace create(String date) {
        MealContext c=new MealContext();c.setDate(date);WorkspaceRequest r=new WorkspaceRequest();r.setRequestId("create-"+date);r.setExpectedWorkspaceRevision(0L);r.setContext(c);return service.create(1L,r);
    }
    private MealWorkspace draft(String date) {
        MealWorkspace w=create(date);WorkspaceRequest r=request(w,"generate-"+date);r.setCommand("generate");w=service.mutate(1L,w.getId(),"command",r);
        WorkspaceTask task=db.taskById(w.getTaskId(),w.getId(),1L);task.setLeaseToken("lease");assertEquals(1,db.claim(task.getId(),task.getLeaseToken()));
        PlanDraft draft=new PlanDraft();draft.setDishes(Collections.singletonList(dish));draft.setPlanVersion(1L);draft.setContextFingerprint(MealWorkspaceRules.contextFingerprint(w.getContext()));return service.finish(task,null,draft,"ready","draft");
    }
    @Test void confirmationReplayIsSingleAndActualSnapshotIsIndependent() {
        MealWorkspace w=draft("2026-10-21");WorkspaceRequest r=request(w,"Confirm-A");r.setExpectedPlanRevision(0L);
        MealWorkspace confirmed=service.mutate(1L,w.getId(),"confirm",r);service.mutate(1L,w.getId(),"confirm",r);
        assertEquals("planned",confirmed.getStatus());assertEquals(1L,plans.findSlot(1L,"2026-10-21","lunch").getRevision());
        RecipeRecord linked=(RecipeRecord)service.linked(1L,confirmed).get("plan");
        assertEquals("测试菜",linked.getRecipeName());assertEquals(Collections.singletonList(1L),linked.getDishIds());assertEquals(2,linked.getTargetPeople());
        assertNull(actual.find(1L,"2026-10-21","lunch"));assertEquals(1,sql.queryForObject("SELECT COUNT(*) FROM behavior_event WHERE workspace_id=? AND event_type='plan_saved'",Integer.class,w.getId()));
        r.setExpectedPlanRevision(1L);assertThrows(MealConsumptionService.VersionConflict.class,()->service.mutate(1L,w.getId(),"confirm",r));
        sql.update("INSERT INTO meal_consumption(user_id,meal_date,meal_type,status,actual_dishes_json) VALUES(1,'2026-10-21','lunch','eaten','[{\"id\":1,\"name\":\"实际快照\"}]')");
        tx.execute(t->{plans.deleteByDateAndMeal(1L,"2026-10-21","lunch");return null;});
        assertTrue(actual.find(1L,"2026-10-21","lunch").getActualDishesJson().contains("实际快照"));
    }
    @Test void twoDevicesConflictAndCancelledLateTaskCannotApply() {
        MealWorkspace w=create("2026-10-22");WorkspaceRequest a=request(w,"context-A"),b=request(w,"context-B");a.setContext(w.getContext());b.setContext(w.getContext());
        String workspaceId=w.getId();service.mutate(1L,workspaceId,"context",a);assertThrows(MealConsumptionService.VersionConflict.class,()->service.mutate(1L,workspaceId,"context",b));
        w=service.current(1L,"2026-10-22","lunch");WorkspaceRequest start=request(w,"task-start");start.setCommand("generate");w=service.mutate(1L,w.getId(),"command",start);
        WorkspaceTask task=db.taskById(w.getTaskId(),w.getId(),1L);task.setLeaseToken("late-lease");db.claim(task.getId(),task.getLeaseToken());
        WorkspaceRequest cancel=request(w,"task-cancel");cancel.setCommand("cancel");MealWorkspace stopped=service.mutate(1L,w.getId(),"command",cancel);
        PlanDraft late=new PlanDraft();late.setDishes(Collections.singletonList(dish));late.setPlanVersion(1L);service.finish(task,null,late,"late","draft");
        assertEquals(stopped.getRevision(),service.current(1L,"2026-10-22","lunch").getRevision());assertTrue(service.current(1L,"2026-10-22","lunch").getDraft().getDishes().isEmpty());
        assertThrows(IllegalArgumentException.class,()->service.mutate(2L,stopped.getId(),"context",a));
    }
    @Test void lockingReadDetectsRecipeEditAfterRepeatableReadSnapshot() {
        sql.update("INSERT INTO food(ID,NAME,TYPE,CL,COOK_MINUTES,IS_PUBLISHED) VALUES(99881,'race dish','veg','greens',5,1)");
        Dish reviewed=food.selectByIdsForUser(Collections.singletonList(99881L),1L).get(0);
        MealWorkspace w=create("2026-10-25");w.getContext().setCompositionMode("manual");w.getContext().setCounts(Collections.singletonMap("veg",1));w.getDraft().setDishes(Collections.singletonList(reviewed));
        DishCandidateQueryService candidates=mock(DishCandidateQueryService.class);
        when(candidates.findRawForUser(anyLong(),isNull(),isNull(),any(),anyInt())).thenReturn(Collections.singletonList(reviewed));
        UserPreferenceService prefs=mock(UserPreferenceService.class);when(prefs.get(1L)).thenReturn(new UserPreferenceDTO());
        MealWorkspacePlanner currentPlanner=new MealWorkspacePlanner(candidates,food,prefs,new RecommendationMetadataService(food),mock(FavoriteDishService.class),actual,json);
        JdbcTemplate other=new JdbcTemplate(new DriverManagerDataSource(System.getenv("V4_TEST_JDBC"),"root",System.getenv("V4_TEST_PASSWORD")));
        tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        tx.execute(t->{
            db.find(w.getId(),1L);
            other.update("UPDATE food SET CL='peanut' WHERE ID=99881");
            assertEquals("greens",food.selectByIdsForUser(Collections.singletonList(99881L),1L).get(0).getCl());
            assertThrows(MealConsumptionService.VersionConflict.class,()->currentPlanner.lockAndValidate(1L,w,Collections.singletonList(99881L)));
            return null;
        });
    }
    @Test void receiptFailureRollsBackPlanWorkspaceAndEvents() {
        MealWorkspace w=draft("2026-10-23");WorkspaceRequest r=request(w,"rollback");r.setExpectedPlanRevision(0L);
        sql.execute("CREATE TRIGGER fail_test_receipt BEFORE INSERT ON workspace_request_log FOR EACH ROW BEGIN IF NEW.request_id='rollback' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test receipt failure'; END IF; END");
        try { assertThrows(RuntimeException.class,()->service.mutate(1L,w.getId(),"confirm",r)); } finally { sql.execute("DROP TRIGGER fail_test_receipt"); }
        assertNull(plans.findSlot(1L,"2026-10-23","lunch"));assertEquals(w.getRevision(),service.current(1L,"2026-10-23","lunch").getRevision());
        assertEquals(0,sql.queryForObject("SELECT COUNT(*) FROM behavior_event WHERE workspace_id=? AND event_type='plan_saved'",Integer.class,w.getId()));
    }
}
