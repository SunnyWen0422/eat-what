package com.eatwhat.service;

import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

/**
 * 菜品业务逻辑层
 */
@Service
public class DishService {
    
    @Autowired
    private DishMapper dishMapper;
    
    /**
     * 获取菜品列表
     */
    public List<Dish> getDishes(String type, String keyword, Long userId) {
        return dishMapper.selectDishes(type, keyword, userId);
    }
    
    /**
     * 搜索菜品
     */
    public List<Dish> searchDishes(String keyword, String type) {
        return dishMapper.searchDishes(keyword, type);
    }
    
    /**
     * 创建自定义菜品
     */
    public Dish createDish(Dish dish) {
        dish.setIsCustom(1);
        dishMapper.insert(dish);
        return dish;
    }
    
    /**
     * 根据ID获取菜品
     */
    public Dish getDishById(Long id) {
        return dishMapper.selectById(id);
    }
    
    /**
     * 批量获取菜品
     */
    public List<Dish> getDishesByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return dishMapper.selectByIds(ids);
    }
}

