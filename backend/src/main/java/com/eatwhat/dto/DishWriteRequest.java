package com.eatwhat.dto;
import com.eatwhat.entity.Dish;
import lombok.Getter;
import lombok.Setter;
@Getter @Setter
public class DishWriteRequest extends Dish {
    private String requestId;
    private String expectedVersion;
    // Absent/false preserves legacy/copied optional fields; true allows an intentional null clear.
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean editServingDescription;
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean editImage;
    // New clients create the edited copy in one transaction; absent preserves legacy copy semantics.
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Boolean editCopy;
}
