package com.eatwhat.service;

import com.eatwhat.entity.FavoriteDish;
import com.eatwhat.mapper.FavoriteDishMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
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
        if (userId == null || userId <= 0 || dishId == null || dishId <= 0) {
            throw new IllegalArgumentException("用户和菜品 ID 必须是正整数");
        }
        FavoriteDish favorite = new FavoriteDish();
        favorite.setUserId(userId);
        favorite.setDishId(dishId);
        // MySQL can report zero affected rows for an unchanged duplicate in
        // the same second. Only a currently visible favorite proves success.
        if (favoriteDishMapper.insert(favorite) > 0 || favoriteDishMapper.isFavorite(userId, dishId) > 0) {
            return true;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "菜品不存在或不可访问");
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
