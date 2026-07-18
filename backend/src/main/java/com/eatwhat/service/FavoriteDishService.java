package com.eatwhat.service;

import com.eatwhat.entity.FavoriteDish;
import com.eatwhat.mapper.FavoriteDishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

/**
 * 收藏菜品业务逻辑层
 */
@Service
public class FavoriteDishService {

    @Autowired
    private FavoriteDishMapper favoriteDishMapper;

    /**
     * 添加收藏
     */
    public boolean addFavorite(Long userId, Long dishId) {
        FavoriteDish favorite = new FavoriteDish();
        favorite.setUserId(userId);
        favorite.setDishId(dishId);
        return favoriteDishMapper.insert(favorite) > 0;
    }

    /**
     * 取消收藏
     */
    public boolean removeFavorite(Long userId, Long dishId) {
        return favoriteDishMapper.delete(userId, dishId) > 0;
    }

    /**
     * 检查是否已收藏
     */
    public boolean isFavorite(Long userId, Long dishId) {
        return favoriteDishMapper.isFavorite(userId, dishId) > 0;
    }

    /**
     * 获取用户收藏的所有菜品ID
     */
    public List<Long> getFavoriteDishIds(Long userId) {
        return favoriteDishMapper.selectDishIdsByUser(userId);
    }

    /**
     * 获取用户的收藏列表（带菜品详情）
     */
    public List<FavoriteDish> getFavorites(Long userId) {
        return favoriteDishMapper.selectFavoritesByUser(userId);
    }
}
