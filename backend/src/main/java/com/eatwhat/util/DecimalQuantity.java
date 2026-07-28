package com.eatwhat.util;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;

/** 精确保存数量及单位信息，避免使用 double 造成数量漂移。 */
@Data
@AllArgsConstructor
public class DecimalQuantity {
    private BigDecimal value;
    private BigDecimal min;
    private BigDecimal max;
    private String unitCode;
    private String unitFamily;
    private String displayText;
}
