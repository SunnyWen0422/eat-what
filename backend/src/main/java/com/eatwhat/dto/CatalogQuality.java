package com.eatwhat.dto;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
@Data @JsonIgnoreProperties(ignoreUnknown=true)
public class CatalogQuality {
    private Long dishId;
    private String datasetVersion,sourceHash,contentHash,sourceRecipeVersion,reviewStatus,sourceKind,sourceRef;
    private BigDecimal basePeople;
    private String servingsStatus,stepStatus,nutritionStatus,imageRightsStatus,timeStatus,reviewedBy,reviewedAt,cookedAt;
    private Integer nutritionKcal;
    private List<Ingredient> ingredients=new ArrayList<>();
    private List<String> issueCodes=new ArrayList<>();
    @Data @JsonIgnoreProperties(ignoreUnknown=true)
    public static class Ingredient {
        private String name,unit,rawText,rawQuantity,rawUnit,sourceLabel,preparation,role;
        private String identityStatus,identityEvidence,quantityStatus,quantityEvidence,displayQuantity;
        private BigDecimal quantityValue;
        public boolean verifiedQuantity(){return "VERIFIED".equals(identityStatus)&&"VERIFIED".equals(quantityStatus)&&quantityValue!=null&&quantityValue.signum()>0;}
    }
}
