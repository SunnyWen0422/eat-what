package com.eatwhat.controller;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
public class ShoppingPurchaseController {
    @Value("${shopping-prices.enabled:true}") private boolean prices;
    @Value("${shopping-prices.expenses-enabled:true}") private boolean expenses;
    @Value("${shopping-prices.purchase-enabled:false}") private boolean purchase;
    @Value("${shopping-prices.dingdong-link:}") private String dingdong;
    @Value("${shopping-prices.hema-link:}") private String hema;
    @GetMapping("/shopping-list/purchase-options")
    public Map<String,Object> options() {
        Map<String,Object> result=new LinkedHashMap<>();result.put("pricesEnabled",prices);result.put("expensesEnabled",expenses);
        result.put("platforms",Arrays.asList(platform("叮咚买菜",dingdong),platform("盒马",hema)));return result;
    }
    private Map<String,Object> platform(String name,String link) {
        Map<String,Object> p=new LinkedHashMap<>();p.put("name",name);p.put("enabled",purchase && link!=null && !link.trim().isEmpty());
        p.put("shortLink",Boolean.TRUE.equals(p.get("enabled"))?link:"");return p;
    }
}
