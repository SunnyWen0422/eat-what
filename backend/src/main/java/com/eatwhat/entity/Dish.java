package com.eatwhat.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.Date;

/**
 * 菜品实体类 - 映射food表
 */
@Data
public class Dish {
    @com.fasterxml.jackson.annotation.JsonIgnore
    @lombok.Getter(lombok.AccessLevel.NONE)
    @lombok.Setter(lombok.AccessLevel.NONE)
    private String receiptContentVersion;
    /** Only trusted persisted receipts may restore their original version after DTO deserialization. */
    public void restoreReceiptContentVersion(String version) { receiptContentVersion = version; }
    @com.fasterxml.jackson.annotation.JsonIgnore
    private com.eatwhat.dto.CatalogQuality quality;
    @com.fasterxml.jackson.annotation.JsonIgnore
    private String recipeJson;
    @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = ExactRecipeDeserializer.class)
    private com.fasterxml.jackson.databind.JsonNode recipe;
    private com.fasterxml.jackson.databind.JsonNode scaledRecipe;
    private String catalogRevision;
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String quantityPolicy;
    /** Recipe quantities remain decimal facts at the HTTP boundary as well as in persistence. */
    public static final class ExactRecipeDeserializer extends com.fasterxml.jackson.databind.JsonDeserializer<com.fasterxml.jackson.databind.JsonNode> {
        private static final com.fasterxml.jackson.databind.ObjectReader READER = new com.fasterxml.jackson.databind.ObjectMapper()
                .reader().with(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
        @Override public com.fasterxml.jackson.databind.JsonNode deserialize(com.fasterxml.jackson.core.JsonParser parser, com.fasterxml.jackson.databind.DeserializationContext context) throws java.io.IOException {
            return READER.readTree(parser);
        }
    }
    public void setRecipeJson(String value) {
        receiptContentVersion = null;
        recipeJson = value;
        try { recipe = value == null ? null : new com.fasterxml.jackson.databind.ObjectMapper().enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(value); }
        catch (java.io.IOException e) { throw new IllegalArgumentException("Invalid canonical recipe", e); }
    }
    public void setRecipe(com.fasterxml.jackson.databind.JsonNode value) {
        receiptContentVersion = null;
        recipe = value;
        if(value==null) { recipeJson=null; return; }
        com.fasterxml.jackson.databind.JsonNode stored=value.deepCopy();
        for(com.fasterxml.jackson.databind.JsonNode line:stored.path("ingredients"))
            if(line.isObject()) ((com.fasterxml.jackson.databind.node.ObjectNode)line).remove("ingredient");
        recipeJson=stored.toString();
    }

    @JsonProperty(value = "contentVersion", access = JsonProperty.Access.READ_ONLY)
    public String getContentVersion() { return receiptContentVersion == null ? com.eatwhat.util.DishContentVersion.of(this) : receiptContentVersion; }

    @JsonProperty("id")
    private Long id;

    @JsonProperty("name")
    private String name;

    @JsonProperty("type")
    private String type;  // meat/veg/soup

    @JsonProperty("cl")
    private String cl;  // 菜品材料

    @JsonProperty("fl")
    private String fl;  // 分量

    @JsonProperty("step")
    private String step;  // 步骤

    @JsonProperty("tags")
    private String tags;  // 标签，逗号分隔

    @JsonProperty("cuisineCode")
    private String cuisineCode;

    @JsonProperty("tagCodes")
    private String tagCodes;

    @JsonProperty("cookMinutes")
    private Integer cookMinutes;

    @JsonProperty("metadataVersion")
    private Integer metadataVersion;

    @JsonProperty("image")
    private String image;  // 菜品图片URL

    @JsonProperty("difficulty")
    private String difficulty;  // 难度：简单/普通/困难

    @JsonProperty("cookTime")
    private String cookTime;  // 烹饪时间

    @JsonProperty("ingredientsAmounts")
    private String ingredientsAmounts;  // 食材与用量

    @JsonProperty("steps")
    private String steps;  // 详细步骤

    @JsonProperty("stepImages")
    private String stepImages;  // 步骤图片URL，JSON数组格式

    @JsonProperty("tips")
    private String tips;  // 小贴士

    @JsonProperty("methods")
    private String methods;  // 烹饪方法

    @JsonProperty("kcal")
    private Integer kcal;  // 热量（千卡）

    @JsonProperty("isCustom")
    private Integer isCustom;  // 0-系统，1-用户自定义

    @JsonProperty("isPublished")
    private Integer isPublished;

    @JsonProperty("userId")
    private Long userId;

    @JsonProperty("createTime")
    private Date createTime;
}
