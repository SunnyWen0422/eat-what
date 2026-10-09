package com.eatwhat.dto;
import lombok.Data;
import java.util.List;
@Data
public class PublicDishPageDTO {
    private List<PublicDishDTO> list;
    private long total;
    private int page, pageSize;
}
