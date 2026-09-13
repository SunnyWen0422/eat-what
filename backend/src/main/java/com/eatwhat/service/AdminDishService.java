package com.eatwhat.service;

import com.eatwhat.dto.AdminDishPageDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AdminDishService {
    private static final int MAX_PAGE_SIZE = 50;

    private final DishMapper dishMapper;
    private final CustomDishService customDishService;

    public AdminDishService(DishMapper dishMapper, CustomDishService customDishService) {
        this.dishMapper = dishMapper;
        this.customDishService = customDishService;
    }

    public AdminDishPageDTO list(String scope, String keyword, String type, Integer published,
                                 Long ownerId, Integer page, Integer pageSize) {
        String safeScope = "custom".equalsIgnoreCase(scope) ? "custom" : "system";
        String safeKeyword = keyword == null || keyword.trim().isEmpty() ? null : keyword.trim();
        String safeType = type == null || type.trim().isEmpty() ? null : type.trim().toLowerCase();
        if (published != null && published != 0 && published != 1) {
            throw new IllegalArgumentException("published must be 0 or 1");
        }
        int safePage = page == null || page < 1 ? 1 : page;
        int safePageSize = pageSize == null || pageSize < 1 ? 20 : Math.min(pageSize, MAX_PAGE_SIZE);
        int total = dishMapper.countAdmin(safeScope, safeKeyword, safeType, published, ownerId);
        int maxPage = Math.max(1, (int) ((total + (long) safePageSize - 1) / safePageSize));
        safePage = Math.min(safePage, maxPage);
        List<Dish> list = dishMapper.selectAdminPage(safeScope, safeKeyword, safeType, published,
                ownerId, safePageSize, (safePage - 1) * safePageSize);
        return new AdminDishPageDTO(list, total, safePage, safePageSize);
    }

    public Dish get(Long id) {
        return id == null ? null : dishMapper.selectAdminById(id);
    }

    public Dish updateSystem(Dish input) {
        if (input == null || input.getId() == null) throw new IllegalArgumentException("dishId is required");
        Dish existing = get(input.getId());
        if (existing == null || !Integer.valueOf(0).equals(existing.getIsCustom())) return null;
        customDishService.normalizeDish(input);
        input.setId(existing.getId());
        input.setUserId(null);
        input.setIsCustom(0);
        input.setIsPublished(input.getIsPublished() == null ? existing.getIsPublished() : input.getIsPublished());
        if (input.getIsPublished() != null && input.getIsPublished() != 0 && input.getIsPublished() != 1) {
            throw new IllegalArgumentException("isPublished must be 0 or 1");
        }
        return dishMapper.updateSystemDish(input) > 0 ? get(input.getId()) : null;
    }

    public Dish updatePublication(Long id, Integer published) {
        if (id == null) throw new IllegalArgumentException("dishId is required");
        if (published == null || (published != 0 && published != 1)) {
            throw new IllegalArgumentException("published must be 0 or 1");
        }
        Dish existing = get(id);
        if (existing == null || !Integer.valueOf(0).equals(existing.getIsCustom())) return null;
        if (existing.getIsPublished() != null && existing.getIsPublished().equals(published)) {
            throw new IllegalStateException("dish publication is unchanged");
        }
        if (dishMapper.updateSystemPublication(id, published) == 0) {
            throw new IllegalStateException("dish publication update conflicted");
        }
        return get(id);
    }
}
