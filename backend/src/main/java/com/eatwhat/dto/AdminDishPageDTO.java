package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
public class AdminDishPageDTO {
    private final List<Dish> list;
    private final int total;
    private final int page;
    private final int pageSize;
    private final boolean hasMore;

    public AdminDishPageDTO(List<Dish> list, int total, int page, int pageSize) {
        this.list = list == null ? Collections.emptyList() : list;
        this.total = Math.max(0, total);
        this.page = page;
        this.pageSize = pageSize;
        this.hasMore = page * pageSize < total;
    }
}
