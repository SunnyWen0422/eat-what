package com.eatwhat.dto;
import com.eatwhat.entity.Dish;
import lombok.Getter;
import lombok.Setter;
@Getter @Setter
public class DishWriteRequest extends Dish {
    private String requestId;
    private String expectedVersion;
}
