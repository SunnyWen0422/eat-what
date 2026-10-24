package com.eatwhat.service;
import com.eatwhat.dto.DishWriteRequest;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CanonicalPersonalRecipeTest {
 private final ObjectMapper json=new ObjectMapper();private PersonalDishMapper mapper;private MealConsumptionMapper logs;private CustomDishService service;private CanonicalCatalogService catalog;private JsonNode root;private final Map<Long,Dish> store=new HashMap<>();private final Map<String,Map<String,Object>> receipts=new HashMap<>();
 @BeforeEach void setup() throws Exception {
  String path=System.getenv("EATWHAT_CANONICAL_FIXTURE");Assumptions.assumeTrue(path!=null);root=json.readTree(Files.readAllBytes(Paths.get(path)));Map<String,JsonNode> standards=new HashMap<>();root.path("ingredients").forEach(i->standards.put(i.path("id").asText(),i));CanonicalCatalogMapper definitions=mock(CanonicalCatalogMapper.class);when(definitions.metadata()).thenReturn(root.toString());when(definitions.ingredients(anyCollection())).thenAnswer(c->{List<String> values=new ArrayList<>();for(Object id:(Collection<?>)c.getArgument(0))if(standards.containsKey(id))values.add(standards.get(id).toString());return values;});catalog=new CanonicalCatalogService(definitions,json);
  mapper=mock(PersonalDishMapper.class);logs=mock(MealConsumptionMapper.class);when(logs.lockUser(7L)).thenReturn(7L);when(logs.request(eq(7L),anyString())).thenAnswer(c->receipts.get(c.getArgument(1)));when(logs.log(eq(7L),anyString(),anyString(),anyString())).thenAnswer(c->{Map<String,Object> receipt=new HashMap<>();receipt.put("requestHash",c.getArgument(2));receipt.put("responseJson",c.getArgument(3));receipts.put(c.getArgument(1),receipt);return 1;});
  when(mapper.lockReadable(anyLong(),eq(7L))).thenAnswer(c->store.get(c.getArgument(0)));when(mapper.insert(any())).thenAnswer(c->{Dish d=c.getArgument(0);d.setId(9000L);store.put(9000L,d);return 1;});when(mapper.update(any())).thenAnswer(c->{Dish d=c.getArgument(0);if(!Long.valueOf(7).equals(d.getUserId()))return 0;store.put(d.getId(),d);return 1;});when(mapper.delete(anyLong(),eq(7L))).thenAnswer(c->store.remove(c.getArgument(0))==null?0:1);
  service=new CustomDishService(mock(DishMapper.class),null,mapper,logs,json);ReflectionTestUtils.setField(service,"catalog",catalog);DishQualityService reader=new DishQualityService(mock(DishQualityMapper.class),json);reader.setCatalog(catalog);service.setQuality(reader);Dish source=new Dish();source.setId(31L);source.setRecipe(root.path("recipes").get(0).deepCopy());store.put(31L,source);catalog.enrich(source);
 }
 DishWriteRequest request(String id){DishWriteRequest r=new DishWriteRequest();r.setRequestId(id);r.setRecipe(root.path("recipes").get(0).deepCopy());return r;}
 @Test void createUpdateCopyDeleteKeepOneCanonicalDocumentAndReplayAfterDeletion() throws Exception {
  DishWriteRequest create=request("canonical-create");Dish created=service.createPersonalDish(7L,create);assertEquals(9000L,created.getId());assertEquals(9000L,created.getRecipe().path("id").asLong());assertEquals(7L,created.getUserId());assertFalse(json.readTree(created.getRecipeJson()).path("ingredients").get(0).has("ingredient"));
  DishWriteRequest update=request("canonical-update");update.setExpectedVersion(created.getContentVersion());((ObjectNode)update.getRecipe()).put("name","我的豆腐");Dish saved=service.updatePersonalDish(7L,9000L,update);assertEquals("我的豆腐",saved.getRecipe().path("name").asText());
  DishWriteRequest delete=new DishWriteRequest();delete.setRequestId("canonical-delete");delete.setExpectedVersion(saved.getContentVersion());assertEquals(true,service.deletePersonalDish(7L,9000L,delete).get("success"));assertEquals(created.getContentVersion(),service.createPersonalDish(7L,create).getContentVersion());verify(mapper,times(1)).insert(any());
 }
 @Test void copyReplaySurvivesSourceRemovalAndInvalidOwnerVersionNeverWrites(){Dish source=store.get(31L);DishWriteRequest copy=request("canonical-copy");copy.setExpectedVersion(source.getContentVersion());copy.setEditCopy(true);((ObjectNode)copy.getRecipe()).put("name","复制豆腐");Dish saved=service.copyDish(7L,31L,copy);store.remove(31L);assertEquals(saved.getContentVersion(),service.copyDish(7L,31L,copy).getContentVersion());verify(mapper,times(1)).insert(any());DishWriteRequest stale=request("canonical-stale");stale.setExpectedVersion("stale");assertThrows(MealConsumptionService.VersionConflict.class,()->service.updatePersonalDish(7L,9000L,stale));}
 @Test void plainLegacyAndMissingIngredientWritesAreRejected(){DishWriteRequest legacy=new DishWriteRequest();legacy.setRequestId("legacy-rejected");legacy.setName("旧文字");legacy.setCl("豆腐适量");assertThrows(IllegalArgumentException.class,()->service.createPersonalDish(7L,legacy));DishWriteRequest invalid=request("bad-ingredient");((ObjectNode)invalid.getRecipe().path("ingredients").get(0)).put("ingredientId","not-in-standard");assertThrows(IllegalStateException.class,()->service.createPersonalDish(7L,invalid));verify(mapper,never()).insert(any());}
 @Test void nameOnlyEditedCopyPreservesServerAmountTemplateAndReceiptVersion() throws Exception {
  Dish source=store.get(31L);ObjectNode raw=(ObjectNode)json.readTree(source.getRecipeJson());((ObjectNode)raw.path("steps").get(0)).put("text","加入{{amount:i1}}豆腐");source.setRecipe(raw);catalog.enrich(source);
  DishWriteRequest copy=new DishWriteRequest();copy.setRequestId("copy-rendered-template");copy.setExpectedVersion(source.getContentVersion());copy.setEditCopy(true);copy.setRecipe(source.getRecipe().deepCopy());((ObjectNode)copy.getRecipe()).put("name","我的豆腐");Dish saved=service.copyDish(7L,31L,copy);
  assertEquals("加入{{amount:i1}}豆腐",json.readTree(saved.getRecipeJson()).path("steps").get(0).path("text").asText());assertEquals("加入300克豆腐",catalog.scale(saved,java.math.BigDecimal.ONE).path("steps").get(0).path("text").asText());assertEquals(saved.getContentVersion(),service.copyDish(7L,31L,copy).getContentVersion());
 }
 @Test void requestCannotSetTrustedReceiptVersion() throws Exception {assertThrows(com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException.class,()->json.readValue("{\"receiptContentVersion\":\"forged\"}",Dish.class));Dish d=json.readValue("{\"contentVersion\":\"forged\",\"name\":\"菜\"}",Dish.class);assertNotEquals("forged",d.getContentVersion());assertFalse(json.writeValueAsString(d).contains("receiptContentVersion"));}
}
