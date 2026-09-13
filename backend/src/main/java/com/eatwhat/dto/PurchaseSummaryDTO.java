package com.eatwhat.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
@AllArgsConstructor
public class PurchaseSummaryDTO {
    private List<PurchaseSummaryItemDTO> mergeableItems = new ArrayList<>();
    private List<PurchaseSummaryItemDTO> separateItems = new ArrayList<>();
}
