package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;
@Service
public class ShoppingPreviewService {
 private final DishQueryService dishes;
 @org.springframework.beans.factory.annotation.Autowired private CanonicalCatalogService catalog;
 public ShoppingPreviewService(DishQueryService dishes,IngredientParserService unused,IngredientNormalizationService normalization){this.dishes=dishes;}
 public ShoppingPreviewResponse createPreview(Long userId,ShoppingPreviewRequest request){
  BigDecimal people=request.getTargetPeople();if(people!=null&&(people.compareTo(BigDecimal.ONE)<0||people.compareTo(new BigDecimal("50"))>0))throw new IllegalArgumentException("用餐人数应在1到50之间");
  List<Dish> readable=dishes.getDishesByIdsForUser(request.getDishIds(),userId);if(readable.size()!=new HashSet<>(request.getDishIds()).size())throw new IllegalArgumentException("菜品不存在或不可访问");List<ShoppingDishDTO> groups=new ArrayList<>();int index=0;
  for(Dish dish:readable){JsonNode scaled=catalog.scale(dish,people);ShoppingDishDTO group=new ShoppingDishDTO();group.setSelectionKey("dish-"+dish.getId()+"-"+index++);group.setDishId(dish.getId());group.setDishName(dish.getName());group.setTargetPeople(CanonicalRecipeCalculator.nullableNumber(scaled,"diners"));group.setQuantityPolicy("fixed-recipe-v1");group.setQuantityBasis("fixed_recipe");int line=0;
   for(JsonNode row:scaled.path("ingredients")){int lineNo=line++;if(!row.path("enabled").asBoolean())continue;ShoppingPreviewItemDTO item=new ShoppingPreviewItemDTO();String unit=row.path("unit").asText();BigDecimal quantity=CanonicalRecipeCalculator.nullableNumber(row,"procurementQuantity"),base=CanonicalRecipeCalculator.nullableNumber(scaled,"baseServings");String display=quantity==null?"":quantity.stripTrailingZeros().toPlainString()+unit;
    item.setClientKey("dish-"+dish.getId()+"-ing-"+lineNo);item.setCanonicalName(row.path("name").asText());item.setDisplayName(row.path("name").asText());item.setNormalizedVariant(row.path("ingredientId").asText());item.setSourceDishId(dish.getId());item.setSourceDishName(dish.getName());item.setSourceLineNo(lineNo);item.setSourceQuantityText(row.path("name").asText()+(display.isEmpty()?"":" "+display));item.setSourceBasePeople(base);item.setParseStatus("PARSED");item.setQuantityKind("discretionary".equals(row.path("quantityKind").asText())?"DISCRETIONARY":"EXACT");item.setWarnings(new ArrayList<>());item.setQuantityValue(quantity);item.setUnitCode("piece".equals(unit)?"count":unit);item.setUnitFamily("g".equals(unit)?"mass":"ml".equals(unit)?"volume":"count");item.setQuantityText(display);item.setCalculationStatus(quantity==null?"NEEDS_ADJUSTMENT":"CALCULATED");item.setServingsVerified(quantity!=null);group.getItems().add(item);
    item.setVariantLabel("");
   }groups.add(group);
  }return new ShoppingPreviewResponse(request.getClientRequestId(),groups,Collections.emptyList(),2);
 }
}
