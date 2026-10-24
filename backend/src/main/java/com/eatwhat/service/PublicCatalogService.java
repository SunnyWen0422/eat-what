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
import java.net.URI;
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
    @org.springframework.beans.factory.annotation.Autowired private CanonicalCatalogService catalog;

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
        catalog.enrich(rows);
        Map<Long,CatalogQuality> profiles = Collections.emptyMap();
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
        catalog.enrich(row);
        return project(row, null);
    }
    private void enabled() { if (!properties.isEnabled()) throw unavailable(); }
    private boolean released(Dish d, List<Long> ids) {
        return d != null && d.getId() != null && ids.contains(d.getId()) && d.getUserId() == null && Integer.valueOf(0).equals(d.getIsCustom()) && Integer.valueOf(1).equals(d.getIsPublished());
    }
    private static ResponseStatusException unavailable() { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Public recipe directory is unavailable"); }
    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid public recipe request"); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Public recipe is unavailable"); }

    public com.fasterxml.jackson.databind.JsonNode scale(long id,java.math.BigDecimal servings) {
        return scale(id,servings,null);
    }
    public com.fasterxml.jackson.databind.JsonNode scale(long id,java.math.BigDecimal servings,Map<String,Boolean> overrides) {
        enabled();if(id<=0||id>PublicCatalogProperties.MAX_SAFE_ID)throw invalid();
        List<Long> ids=properties.getAllowedDishIds();if(!ids.contains(id))throw missing();
        Dish dish=mapper.detail(ids,id);if(!released(dish,ids)||dish.getId()!=id)throw missing();
        return catalog.scale(dish,servings,overrides);
    }
    private PublicDishDTO project(Dish d, CatalogQuality profile) {
        if (d.getName() == null || d.getName().trim().isEmpty()) throw unavailable();
        for (String text : Arrays.asList(d.getName(), d.getType(), d.getCl(), d.getFl(), d.getStep(), d.getSteps(), d.getTips(), d.getIngredientsAmounts())) bounded(text);
        PublicDishDTO value = new PublicDishDTO();
        value.setId(d.getId()); value.setName(d.getName()); value.setType(d.getType()); value.setCl(d.getCl()); value.setFl(d.getFl()); value.setStep(d.getStep()); value.setSteps(d.getSteps()); value.setTips(d.getTips()); value.setIngredientsAmounts(d.getIngredientsAmounts());
        value.setImage(publicCover(d.getImage()));
        value.setContentVersion(d.getContentVersion());value.setQuantityPolicy(d.getQuantityPolicy());
        com.fasterxml.jackson.databind.node.ObjectNode recipe=d.getRecipe().deepCopy();recipe.put("imageUrl",publicCover(recipe.path("imageUrl").asText(null)));
        for(com.fasterxml.jackson.databind.JsonNode step:recipe.path("steps"))if(step.isObject())((com.fasterxml.jackson.databind.node.ObjectNode)step).remove(Arrays.asList("image","imageUrl","stepImage","stepImages"));
        value.setRecipe(recipe);com.fasterxml.jackson.databind.JsonNode scaled=d.getScaledRecipe().deepCopy();sanitizeStepMedia(scaled);value.setScaledRecipe(scaled);value.setCatalogRevision(d.getCatalogRevision()); return value;
    }
    private static void sanitizeStepMedia(com.fasterxml.jackson.databind.JsonNode value){if(value.isObject()){com.fasterxml.jackson.databind.node.ObjectNode object=(com.fasterxml.jackson.databind.node.ObjectNode)value;object.remove(Arrays.asList("image","imageUrl","stepImage","stepImages"));object.elements().forEachRemaining(PublicCatalogService::sanitizeStepMedia);}else if(value.isArray())for(com.fasterxml.jackson.databind.JsonNode child:value)sanitizeStepMedia(child);}
    /** Display-only cover from an already released system dish; never fetch media server-side. */
    private static String publicCover(String raw) {
        if (raw == null || raw.length() > 2048) return null;
        try {
            String value = raw.trim(); URI uri = new URI(value);
            String scheme = uri.getScheme(), host = uri.getHost();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) || host == null || uri.getRawUserInfo() != null) return null;
            host = host.toLowerCase(Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0,host.length()-1);
            if (!host.contains(".") || host.endsWith(".local") || host.endsWith(".localhost") || host.matches("[0-9.]+") || host.contains(":")) return null;
            return "https" + value.substring(value.indexOf(':'));
        } catch (Exception malformed) { return null; }
    }
    private static void bounded(String text) { if (text != null && text.length() > MAX_TEXT) throw unavailable(); }
}
