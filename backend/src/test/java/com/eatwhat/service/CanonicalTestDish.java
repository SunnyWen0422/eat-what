package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.CanonicalCatalogMapper;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import static org.mockito.Mockito.*;

/** Explicit synthetic canonical fixtures; no legacy production fallback or external catalog. */
final class CanonicalTestDish {
 static final ObjectMapper JSON=new ObjectMapper();
 static Dish attach(Dish dish){return attach(dish,dish.getCl()==null||dish.getCl().isEmpty()?"青菜":dish.getCl(),dish.getCookMinutes(),dish.getTagCodes()!=null&&dish.getTagCodes().contains("BREAKFAST_ELIGIBLE"));}
 static Dish attach(Dish dish,String name,Integer minutes,boolean breakfast){
  ObjectNode r=JSON.createObjectNode();r.put("quantityPolicy","fixed-recipe-v1");r.put("id",dish.getId());r.put("name",dish.getName());r.put("baseServings",2);r.put("servingBasis","declared_servings");r.put("dishGroupId","test-dish-"+dish.getId());r.put("servingRole","dish");
  String type=dish.getType();r.put("categoryCode","meat".equals(type)?"CAT_MEAT":"staple".equals(type)?"CAT_STAPLE":"soup".equals(type)?"CAT_SOUP":"dessert".equals(type)?"CAT_DESSERT":"CAT_VEGETABLE");
  ArrayNode meals=r.putArray("mealCodes");if(breakfast)meals.add("MEAL_BREAKFAST");meals.add("MEAL_LUNCH").add("MEAL_DINNER");r.putArray("dietaryCodes").add("DIET_VEGAN");r.putArray("allergenCodes");r.putArray("methodCodes").add("METHOD_STIR_FRY");r.putArray("operationCodes");r.putArray("sceneCodes");
  ObjectNode timing=r.putObject("timing");if(minutes==null){timing.putNull("activeMinutes");timing.putNull("waitMinutes");timing.putNull("totalMinutes");}else{timing.put("activeMinutes",minutes).put("waitMinutes",0).put("totalMinutes",minutes);}
  ObjectNode i=r.putArray("ingredients").addObject();i.put("id","i1").put("ingredientId","test-"+name).put("quantity",100).put("quantityKind","exact").put("unit","g").put("role","main").put("optional",false).put("defaultEnabled",true).put("preparation","");i.set("ingredient",definition("test-"+name));
  ObjectNode step=r.putArray("steps").addObject();step.put("id","s1").put("text","清洗后炒熟");step.putArray("ingredientLineIds").add("i1");step.putArray("dependsOn");if(minutes==null){step.putNull("activeMinutes");step.putNull("waitMinutes");}else step.put("activeMinutes",minutes).put("waitMinutes",0);
  r.putObject("calculatedNutrition").put("completeness","partial").putNull("total").putNull("perServing");dish.setRecipe(r);dish.setCatalogRevision("canonical-test-v4");return dish;
 }
 static ObjectNode definition(String id){ObjectNode d=JSON.createObjectNode();d.put("id",id).put("name",id.startsWith("test-")?id.substring(5):id).put("unit","g").put("group","vegetable").put("definitionKnowledge","identity_only").put("gramsPerUnit",1).put("procurementYield",1).put("animal",false);d.putArray("animalOrigins");d.putArray("allergens");d.putArray("aliases");d.putNull("nutritionPer100g");return d;}
 static CanonicalCatalogService catalog(){CanonicalCatalogMapper mapper=mock(CanonicalCatalogMapper.class);when(mapper.metadata()).thenReturn("{\"catalogContractVersion\":4,\"quantityPolicy\":\"fixed-recipe-v1\",\"catalogRevision\":\"canonical-test-v4\"}");when(mapper.ingredients(anyCollection())).thenAnswer(call->{List<String> out=new ArrayList<>();for(String id:(Collection<String>)call.getArgument(0))out.add(definition(id).toString());return out;});return new CanonicalCatalogService(mapper,JSON);}
 static DishQualityService quality(){DishQualityService service=new DishQualityService(mock(DishQualityMapper.class),JSON);service.setCatalog(catalog());return service;}
}
