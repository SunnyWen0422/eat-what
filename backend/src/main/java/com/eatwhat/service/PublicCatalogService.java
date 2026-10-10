package com.eatwhat.service;

import com.eatwhat.config.PublicCatalogProperties;
import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.*;
import com.eatwhat.util.DishContentVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/** Anonymous directory has no user, personal, recommendation or model-service dependency. */
@Service
public class PublicCatalogService {
    private static final Set<String> TYPES = new HashSet<>(Arrays.asList("meat", "veg", "soup", "staple", "dessert"));
    private static final Set<String> REVIEW = new HashSet<>(Arrays.asList("VERIFIED", "UNREVIEWED", "UNKNOWN", "BROWSE_ONLY", "REJECTED"));
    private static final int MAX_TEXT = 20000;
    private final PublicCatalogProperties properties;
    private final PublicCatalogMapper mapper;
    private final DishQualityMapper qualityMapper;
    private final ObjectMapper json;

    public PublicCatalogService(PublicCatalogProperties properties, PublicCatalogMapper mapper, DishQualityMapper qualityMapper, ObjectMapper json) {
        this.properties = properties; this.mapper = mapper; this.qualityMapper = qualityMapper; this.json = json;
    }
    public PublicDishPageDTO list(int page, int pageSize, String type) {
        enabled();
        long offset = ((long) page - 1) * pageSize;
        if (page < 1 || page > PublicCatalogProperties.MAX_RELEASE_IDS || pageSize < 1 || pageSize > 100 || offset < 0 || offset > Integer.MAX_VALUE || (type != null && !TYPES.contains(type))) throw invalid();
        List<Long> ids = properties.getAllowedDishIds();
        long total = ids.isEmpty() ? 0 : mapper.count(ids, type);
        if (total < 0 || total > ids.size()) throw unavailable();
        List<Dish> rows = offset >= total ? Collections.emptyList() : mapper.list(ids, type, pageSize, (int) offset);
        if (rows == null || rows.size() != Math.min(pageSize, Math.max(0, total - offset))) throw unavailable();
        Set<Long> unique = new HashSet<>();
        for (Dish row : rows) if (!released(row, ids) || !unique.add(row.getId()) || (type != null && !type.equals(row.getType()))) throw unavailable();
        Map<Long,CatalogQuality> profiles = profiles(rows);
        List<PublicDishDTO> dishes = rows.stream().map(d -> project(d, profiles.get(d.getId()))).collect(Collectors.toList());
        PublicDishPageDTO result = new PublicDishPageDTO(); result.setList(dishes); result.setTotal(total); result.setPage(page); result.setPageSize(pageSize); return result;
    }
    public PublicDishDTO detail(long id) {
        enabled();
        if (id <= 0 || id > PublicCatalogProperties.MAX_SAFE_ID) throw invalid();
        List<Long> ids = properties.getAllowedDishIds();
        if (!ids.contains(id)) throw missing();
        Dish row = mapper.detail(ids, id);
        if (!released(row, ids) || row.getId() != id) throw missing();
        return project(row, profiles(Collections.singletonList(row)).get(id));
    }
    private void enabled() { if (!properties.isEnabled()) throw unavailable(); }
    private boolean released(Dish d, List<Long> ids) {
        return d != null && d.getId() != null && ids.contains(d.getId()) && d.getUserId() == null && Integer.valueOf(0).equals(d.getIsCustom()) && Integer.valueOf(1).equals(d.getIsPublished());
    }
    private static ResponseStatusException unavailable() { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Public recipe directory is unavailable"); }
    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid public recipe request"); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Public recipe is unavailable"); }

    /** Profile reads occur only after all release/ownership predicates have passed. */
    private Map<Long,CatalogQuality> profiles(List<Dish> dishes) {
        if (dishes.isEmpty()) return Collections.emptyMap();
        Map<Long,Dish> byId = dishes.stream().collect(Collectors.toMap(Dish::getId, d -> d));
        Map<Long,CatalogQuality> result = new HashMap<>(); Set<Long> duplicate = new HashSet<>();
        List<DishQualityMapper.Row> rows;
        try { rows = qualityMapper.find(new ArrayList<>(byId.keySet())); }
        catch (RuntimeException unavailableQuality) { return Collections.emptyMap(); }
        if (rows == null) return result;
        for (DishQualityMapper.Row row : rows) {
            if (row == null || !byId.containsKey(row.getDishId())) continue;
            if (result.containsKey(row.getDishId())) { duplicate.add(row.getDishId()); continue; }
            try {
                if (row.getProfileJson() == null || row.getProfileJson().length() > 1024 * 1024) continue;
                CatalogQuality q = json.readValue(row.getProfileJson(), CatalogQuality.class);
                if (q == null || !Objects.equals(row.getDishId(), q.getDishId()) || q.getIngredients() == null || q.getIngredients().isEmpty() || q.getIngredients().size() > 500 || !DishContentVersion.rawOf(byId.get(row.getDishId())).equals(q.getSourceRecipeVersion())) continue;
                for (CatalogQuality.Ingredient i : q.getIngredients()) {
                    if (i == null) throw new IllegalArgumentException();
                    for (String text : Arrays.asList(i.getName(), i.getUnit(), i.getRawText(), i.getRawQuantity(), i.getRawUnit(), i.getDisplayQuantity(), i.getPreparation(), i.getRole())) bounded(text);
                }
                result.put(row.getDishId(), q);
            } catch (Exception malformedQuality) { /* Unknown facts cannot authorize generation or scaling. */ }
        }
        duplicate.forEach(result::remove); return result;
    }
    private PublicDishDTO project(Dish d, CatalogQuality profile) {
        if (d.getName() == null || d.getName().trim().isEmpty()) throw unavailable();
        for (String text : Arrays.asList(d.getName(), d.getType(), d.getCl(), d.getFl(), d.getStep(), d.getSteps(), d.getTips(), d.getIngredientsAmounts())) bounded(text);
        PublicDishDTO value = new PublicDishDTO();
        value.setId(d.getId()); value.setName(d.getName()); value.setType(d.getType()); value.setCl(d.getCl()); value.setFl(d.getFl()); value.setStep(d.getStep()); value.setSteps(d.getSteps()); value.setTips(d.getTips()); value.setIngredientsAmounts(d.getIngredientsAmounts());
        value.setContentVersion(DishContentVersion.rawOf(d)); value.setQuality(projectQuality(profile)); return value;
    }
    private PublicDishDTO.Quality projectQuality(CatalogQuality q) {
        PublicDishDTO.Quality value = new PublicDishDTO.Quality();
        value.setReviewStatus(q != null && REVIEW.contains(q.getReviewStatus()) ? q.getReviewStatus() : "UNKNOWN");
        boolean reviewed = "VERIFIED".equals(value.getReviewStatus());
        value.setServingsStatus(reviewed ? status(q.getServingsStatus()) : "UNKNOWN"); value.setStepStatus(reviewed ? status(q.getStepStatus()) : "UNKNOWN"); value.setTimeStatus(reviewed ? status(q.getTimeStatus()) : "UNKNOWN");
        BigDecimal base = q == null ? null : q.getBasePeople();
        if ("VERIFIED".equals(value.getServingsStatus()) && base != null && base.stripTrailingZeros().scale() <= 0 && base.compareTo(BigDecimal.ONE) >= 0 && base.compareTo(new BigDecimal("50")) <= 0) value.setBasePeople(base);
        else value.setServingsStatus("UNKNOWN");
        if (q != null) for (CatalogQuality.Ingredient source : q.getIngredients()) {
            PublicDishDTO.Ingredient i = new PublicDishDTO.Ingredient();
            i.setName(source.getName()); i.setUnit(source.getUnit()); i.setRawText(source.getRawText()); i.setRawQuantity(source.getRawQuantity()); i.setRawUnit(source.getRawUnit()); i.setDisplayQuantity(source.getDisplayQuantity()); i.setPreparation(source.getPreparation()); i.setRole(source.getRole());
            i.setIdentityStatus(status(source.getIdentityStatus()));
            boolean quantityVerified = reviewed && "VERIFIED".equals(i.getIdentityStatus()) && "VERIFIED".equals(source.getQuantityStatus()) && source.getName() != null && !source.getName().trim().isEmpty() && source.getUnit() != null && !source.getUnit().trim().isEmpty() && source.getQuantityValue() != null && source.getQuantityValue().signum() > 0 && source.getQuantityValue().compareTo(new BigDecimal("1000000")) <= 0;
            i.setQuantityStatus(quantityVerified ? "VERIFIED" : "UNKNOWN"); i.setQuantityValue(quantityVerified ? source.getQuantityValue() : null); value.getIngredients().add(i);
        }
        // Internal issue strings may contain identities/provenance: emit only a fixed public reason.
        if (!reviewed || q.getIssueCodes() == null || !q.getIssueCodes().isEmpty()) value.setIssueCodes(Collections.singletonList("INFORMATION_INCOMPLETE"));
        return value;
    }
    private static String status(String value) { return "VERIFIED".equals(value) ? "VERIFIED" : "UNKNOWN"; }
    private static void bounded(String text) { if (text != null && text.length() > MAX_TEXT) throw unavailable(); }
}
