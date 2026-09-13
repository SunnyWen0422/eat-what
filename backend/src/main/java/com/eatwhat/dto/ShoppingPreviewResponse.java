package com.eatwhat.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
@AllArgsConstructor
public class ShoppingPreviewResponse {
    private String previewId;
    private List<ShoppingDishDTO> dishes;
    private List<String> warnings;
    private Integer metadataVersion;

    public ShoppingPreviewResponse() {
        this(null, new ArrayList<ShoppingDishDTO>(), new ArrayList<String>(), 1);
    }
}
