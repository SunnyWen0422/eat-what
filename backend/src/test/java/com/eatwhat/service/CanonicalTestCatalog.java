package com.eatwhat.service;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.math.BigDecimal;
import static org.mockito.Mockito.*;

/** Explicit synthetic canonical data for isolated service contracts; never loads a database or model. */
final class CanonicalTestCatalog {
 static final ObjectMapper JSON=new ObjectMapper();
 static ObjectNode recipe(long id,String name,String ingredient,BigDecimal quantity,BigDecimal base){
  ObjectNode r=JSON.createObjectNode();r.put("id",id);r.put("name",name);r.set("baseServings",base==null?NullNode.instance:DecimalNode.valueOf(base));r.put("servingBasis",base==null?"recipe_batch":"declared_servings");r.put("categoryCode","fish".equals(ingredient)?"CAT_MEAT_FISH":"CAT_VEGETABLE");r.put("servingRole","dish");r.put("dishGroupId","test-"+id);r.putArray("mealCodes").add("MEAL_BREAKFAST").add("MEAL_LUNCH").add("MEAL_DINNER");r.putArray("methodCodes").add("METHOD_STEAM");r.put("quantityPolicy","fixed-recipe-v1");
  line(r.putArray("ingredients"),"i1",ingredient,quantity);ArrayNode steps=r.putArray("steps");step(steps,"s1","准备材料",5,null);step(steps,"s2","蒸熟",5,"s1");r.putObject("timing").put("activeMinutes",10).put("waitMinutes",0).put("totalMinutes",10);return r;
 }
 static void line(ArrayNode rows,String id,String ingredient,BigDecimal q){ObjectNode line=rows.addObject();line.put("id",id);line.put("ingredientId",ingredient);line.set("quantity",q==null?NullNode.instance:DecimalNode.valueOf(q));line.put("quantityKind",q==null?"discretionary":"exact");if(q==null)line.put("quantityDisplay","适量");line.put("unit","g");line.put("role","main");line.put("preparation","");line.put("optional",false);line.put("defaultEnabled",true);}
 static void step(ArrayNode steps,String id,String text,int minutes,String parent){ObjectNode step=steps.addObject();step.put("id",id);step.put("text",text);step.put("activeMinutes",minutes);step.put("waitMinutes",0);step.putArray("ingredientLineIds").add("i1");ArrayNode refs=step.putArray("dependsOn");if(parent!=null)refs.add(parent);}
 static Dish dish(long id,String name,String ingredient,BigDecimal quantity,BigDecimal base){Dish d=new Dish();d.setId(id);d.setName(name);d.setRecipe(recipe(id,name,ingredient,quantity,base));return d;}
 static Dish fish(long id){return dish(id,"鱼","fish",new BigDecimal("100"),new BigDecimal("2"));}
 static void changed(Dish d,java.util.function.Consumer<ObjectNode> change){ObjectNode r=d.getRecipe().deepCopy();change.accept(r);d.setRecipe(r);}
 static CanonicalCatalogService service(){
  CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);Map<String,JsonNode> definitions=new LinkedHashMap<>();String[][] rows={{"a","青菜"},{"green","青菜"},{"salt","盐"},{"fish","鱼"},{"ginger","姜"},{"potato","土豆"},{"lemon","柠檬"},{"sugar","白糖"}};
  for(String[] pair:rows){ObjectNode i=JSON.createObjectNode();i.put("id",pair[0]);i.put("name",pair[1]);i.putArray("aliases");i.put("group","fish".equals(pair[0])?"fish":"vegetable");i.put("unit","g");i.put("gramsPerUnit",1);i.put("procurementYield",1);i.put("animal","fish".equals(pair[0]));ArrayNode origins=i.putArray("animalOrigins"),allergens=i.putArray("allergens");if("fish".equals(pair[0])){origins.add("fish");allergens.add("fish");}ObjectNode nutrition=i.putObject("nutritionPer100g");for(String n:CanonicalRecipeCalculator.NUTRIENTS)nutrition.put(n,1);definitions.put(pair[0],i);}
  when(mapper.ingredients(anyCollection())).thenAnswer(c->{List<String> out=new ArrayList<>();for(Object id:(Collection<?>)c.getArgument(0))if(definitions.containsKey(id))out.add(definitions.get(id).toString());return out;});ObjectNode metadata=JSON.createObjectNode();metadata.put("catalogRevision","canonical-synthetic-v4");metadata.put("catalogContractVersion",4);metadata.put("quantityPolicy","fixed-recipe-v1");metadata.put("nutritionRuleVersion","v4-test");ObjectNode entries=metadata.putObject("taxonomy").putObject("entries");for(String c:Arrays.asList("CAT_MEAT_FISH","CAT_VEGETABLE","CAT_SIDE","CAT_SOUP"))entries.putObject(c).put("dimension","category");for(String m:Arrays.asList("MEAL_BREAKFAST","MEAL_LUNCH","MEAL_DINNER"))entries.putObject(m).put("dimension","meal");when(mapper.metadata()).thenReturn(metadata.toString());return new CanonicalCatalogService(mapper,JSON);
 }
 static DishQualityService quality(CanonicalCatalogService catalog){DishQualityService quality=new DishQualityService(mock(DishQualityMapper.class),JSON);quality.setCatalog(catalog);return quality;}
 static <T>T wire(T target,CanonicalCatalogService catalog){org.springframework.test.util.ReflectionTestUtils.setField(target,"catalog",catalog);return target;}
 static Dish cloneDish(Dish source){Dish d=JSON.convertValue(source,Dish.class);if(source.getRecipeJson()!=null)d.setRecipeJson(source.getRecipeJson());d.restoreReceiptContentVersion(source.getContentVersion());return d;}
}
