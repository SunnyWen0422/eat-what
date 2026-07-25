package com.eatwhat.dto;

import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
public class AdminUserPageDTO {
    private final List<AdminUserSummaryDTO> list;
    private final int total;
    private final int page;
    private final int pageSize;
    private final String keyword;

    public AdminUserPageDTO(List<AdminUserSummaryDTO> list,
                            int total,
                            int page,
                            int pageSize,
                            String keyword) {
        this.list = list == null ? Collections.emptyList() : list;
        this.total = Math.max(0, total);
        this.page = page;
        this.pageSize = pageSize;
        this.keyword = keyword;
    }

    public List<AdminUserSummaryDTO> getData() {
        return list;
    }

    public boolean isSuccess() {
        return true;
    }
}
