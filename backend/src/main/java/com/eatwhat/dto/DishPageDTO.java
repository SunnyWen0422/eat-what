package com.eatwhat.dto;

import com.eatwhat.entity.Dish;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class DishPageDTO {
    private List<Dish> list;
    private int total;
    private int page;
    private int pageSize;
}
