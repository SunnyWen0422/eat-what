package com.eatwhat.service;
import com.eatwhat.dto.CatalogQuality;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishQualityMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.stereotype.Service;
/** Compatibility service name only: all reads now resolve the single canonical catalog. */
@Service
public class DishQualityService {
 private CanonicalCatalogService catalog;
 public DishQualityService(DishQualityMapper ignored,ObjectMapper json){}
 @org.springframework.beans.factory.annotation.Autowired public void setCatalog(CanonicalCatalogService catalog){this.catalog=catalog;}
 public Dish enrich(Dish dish){return catalog.enrich(dish);}
 public List<Dish> enrich(List<Dish> dishes){return catalog.enrich(dishes);}
 public void inheritCopy(Dish source,Dish copy){}
 public void inheritEditedCopy(Dish source,Dish copy){}
 public void reconcileEdit(Dish current,Dish next){}
 public Map<String,Object> getEffectiveCapabilities(Dish dish,CatalogQuality ignored){
  boolean ready=dish!=null&&dish.getRecipe()!=null,scalable=false;
  boolean priceable=ready&&dish.getScaledRecipe()!=null;boolean hasEnabled=false;
  if(priceable)for(com.fasterxml.jackson.databind.JsonNode line:dish.getScaledRecipe().path("ingredients"))if(line.path("enabled").asBoolean()){hasEnabled=true;if(!line.path("procurementQuantity").isNumber())priceable=false;}
  Map<String,Object> out=new LinkedHashMap<>();out.put("browsable",ready);out.put("recommendable",ready);out.put("scalable",scalable);out.put("priceable",priceable&&hasEnabled);out.put("reasons",Collections.emptyList());return out;
 }
}
