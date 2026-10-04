package com.eatwhat.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.ArrayList;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PurchaseSummaryDTO {
    private List<PurchaseSummaryItemDTO> mergeableItems = new ArrayList<>();
    private List<PurchaseSummaryItemDTO> separateItems = new ArrayList<>();
}
