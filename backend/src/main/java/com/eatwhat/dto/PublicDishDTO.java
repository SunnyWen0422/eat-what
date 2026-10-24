package com.eatwhat.dto;
import lombok.Data;
import java.math.BigDecimal;
import java.util.*;
/** Only this whitelist is serialized to the anonymous recipe directory. */
@Data
public class PublicDishDTO {
    private Long id;
    private String name, type, cl, fl, step, steps, tips, ingredientsAmounts, contentVersion, image;
    @com.fasterxml.jackson.annotation.JsonIgnore private Quality quality;
    private com.fasterxml.jackson.databind.JsonNode recipe, scaledRecipe;
    private String catalogRevision;
    private String quantityPolicy;
    @Data public static class Quality {
        private String reviewStatus, servingsStatus, stepStatus, timeStatus;
        private BigDecimal basePeople;
        private List<String> issueCodes = new ArrayList<>();
        private List<Ingredient> ingredients = new ArrayList<>();
    }
    @Data public static class Ingredient {
        private String name, unit, rawText, rawQuantity, rawUnit, displayQuantity, preparation, role;
        private BigDecimal quantityValue;
        private String identityStatus, quantityStatus;
    }
}
