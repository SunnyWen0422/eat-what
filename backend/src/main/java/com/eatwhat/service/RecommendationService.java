package com.eatwhat.service;

import com.eatwhat.dto.PlanDTO;
import com.eatwhat.dto.EffectiveRecommendationCriteria;
import com.eatwhat.dto.RecommendRequest;
import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.entity.Dish;
import com.eatwhat.mapper.DishMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Random;
import java.util.LinkedHashMap;

@Service
public class RecommendationService {

    private static final int CANDIDATE_LIMIT = 100;
    private static final String[] RECOMMEND_TYPES = {"meat", "veg", "soup", "dessert", "staple"};

    private final DishMapper dishMapper;
    private final RecommendationCriteriaResolver criteriaResolver = new RecommendationCriteriaResolver();
    private final RecommendationScorer scorer = new RecommendationScorer();
    private final Random random;

    public RecommendationService(DishMapper dishMapper) {
        this(dishMapper, new Random());
    }

    RecommendationService(DishMapper dishMapper, Random random) {
        this.dishMapper = dishMapper;
        this.random = random;
    }

    public List<PlanDTO> generatePlans(RecommendRequest request) {
        return generatePlans(request, new UserPreferenceDTO(), Collections.<Long>emptySet(), Collections.<Long>emptySet());
    }

    /**
     * Applies session filters as hard eligibility rules, then ranks the remaining
     * dishes using optional persisted preferences. The mapper remains synchronous
     * because MyBatis sessions are bound to the request thread.
     */
    public List<PlanDTO> generatePlans(RecommendRequest request,
                                       UserPreferenceDTO preferences,
                                       Set<Long> favoriteIds,
                                       Set<Long> recentIds) {
        return generatePlans(request, preferences, favoriteIds, recentIds, null);
    }

    public List<PlanDTO> generatePlans(RecommendRequest request,
                                       UserPreferenceDTO preferences,
                                       Set<Long> favoriteIds,
                                       Set<Long> recentIds,
                                       Long userId) {
        RecommendRequest req = request == null ? new RecommendRequest() : request;
        Map<String, Integer> counts = new HashMap<>();
        counts.put("meat", valueOrDefault(req.getMeat(), 2));
        counts.put("veg", valueOrDefault(req.getVeg(), 2));
        counts.put("soup", valueOrDefault(req.getSoup(), 1));
        counts.put("dessert", valueOrDefault(req.getDessert(), 0));
        counts.put("staple", valueOrDefault(req.getStaple(), 0));

        boolean useSavedPreferences = !Boolean.FALSE.equals(req.getUseSavedPreferences());
        EffectiveRecommendationCriteria criteria = criteriaResolver.resolve(req.getCriteria(), preferences, useSavedPreferences);
        List<Long> batchIds = loadCandidateIds(hasHardCriteria(criteria), userId);
        if (batchIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<Dish> allCandidates = filterCandidates(dishMapper.selectByIds(batchIds), criteria);
        Map<String, List<Dish>> pool = splitByType(rankCandidates(allCandidates, criteria, favoriteIds, recentIds));
        List<Dish> userSelected = eligibleSelectedDishes(req, preferences, userId);
        Set<String> usedNamesAcrossAllPlans = new HashSet<>();
        List<PlanDTO> plans = new ArrayList<>();

        for (int index = 0; index < 3; index++) {
            List<Dish> planDishes = new ArrayList<>();
            Set<String> usedNames = new HashSet<>();
            if (userSelected != null) {
                for (Dish dish : userSelected) {
                    addDishIfUnused(planDishes, usedNames, dish);
                }
            }
            // Explicit user selections intentionally appear in every plan. Generated
            // dishes remain unique across plans and cannot duplicate a selection.
            usedNames.addAll(usedNamesAcrossAllPlans);

            Map<String, Integer> remaining = new HashMap<>(counts);
            for (Dish dish : planDishes) {
                if (remaining.containsKey(dish.getType())) {
                    remaining.put(dish.getType(), remaining.get(dish.getType()) - 1);
                }
            }
            for (String type : RECOMMEND_TYPES) {
                fillPlanFromPool(planDishes, usedNames, pool.get(type), remaining.get(type));
            }

            if (!planDishes.isEmpty()) {
                plans.add(new PlanDTO(planDishes));
                for (Dish dish : planDishes) {
                    if (dish.getName() != null) usedNamesAcrossAllPlans.add(dish.getName());
                }
            }
        }
        return plans;
    }

    public Dish getSingleRecommendation(String type, List<Long> excludeIds) {
        List<Long> exclusions = excludeIds == null ? Collections.emptyList() : excludeIds;
        List<Long> ids = dishMapper.selectIdsByTypeExclude(type, exclusions);
        if (ids == null || ids.isEmpty()) {
            return null;
        }
        int randomIndex = (int) (Math.random() * ids.size());
        return dishMapper.selectById(ids.get(randomIndex));
    }

    private List<Long> loadCandidateIds(boolean exhaustive, Long userId) {
        List<Long> batchIds = new ArrayList<>();
        for (String type : RECOMMEND_TYPES) {
            List<Long> ids = userId == null
                    ? dishMapper.selectIdsByType(type)
                    : dishMapper.selectIdsByTypeForUser(type, userId);
            if (ids == null || ids.isEmpty()) continue;
            List<Long> shuffled = new ArrayList<>(ids);
            Collections.shuffle(shuffled, random);
            batchIds.addAll(shuffled.subList(0, exhaustive ? shuffled.size() : Math.min(CANDIDATE_LIMIT, shuffled.size())));
        }
        return batchIds;
    }

    private Map<String, List<Dish>> splitByType(List<Dish> dishes) {
        Map<String, List<Dish>> pool = new HashMap<>();
        for (String type : RECOMMEND_TYPES) pool.put(type, new ArrayList<>());
        if (dishes == null) return pool;
        for (Dish dish : dishes) {
            if (dish != null && pool.containsKey(dish.getType())) pool.get(dish.getType()).add(dish);
        }
        return pool;
    }

    private boolean hasHardCriteria(EffectiveRecommendationCriteria criteria) {
        return !criteria.getCuisineCodes().isEmpty()
                || !criteria.getIncludeTagCodes().isEmpty()
                || !criteria.getExcludeTagCodes().isEmpty()
                || !criteria.getExcludedIngredients().isEmpty()
                || criteria.getMaxCookMinutes() != null;
    }

    private List<Dish> filterCandidates(List<Dish> source, EffectiveRecommendationCriteria criteria) {
        List<Dish> result = new ArrayList<>();
        if (source == null) return result;
        for (Dish dish : source) {
            if (dish == null) continue;
            Set<String> tags = splitCodes(dish.getTagCodes());
            if (!criteria.getCuisineCodes().isEmpty()
                    && (dish.getCuisineCode() == null || !criteria.getCuisineCodes().contains(dish.getCuisineCode()))) continue;
            if (!criteria.getIncludeTagCodes().isEmpty()) {
                boolean includedTag = false;
                for (String code : criteria.getIncludeTagCodes()) {
                    if (tags.contains(code)) {
                        includedTag = true;
                        break;
                    }
                }
                if (!includedTag) continue;
            }
            boolean excludedTag = false;
            for (String code : criteria.getExcludeTagCodes()) {
                if (tags.contains(code)) {
                    excludedTag = true;
                    break;
                }
            }
            if (excludedTag) continue;
            if (criteria.getMaxCookMinutes() != null
                    && (dish.getCookMinutes() == null || dish.getCookMinutes() > criteria.getMaxCookMinutes())) continue;
            if (containsExcludedIngredient(dish, criteria.getExcludedIngredients())) continue;
            result.add(dish);
        }
        return result;
    }

    private List<Dish> rankCandidates(List<Dish> dishes,
                                      EffectiveRecommendationCriteria criteria,
                                      Set<Long> favoriteIds,
                                      Set<Long> recentIds) {
        List<Dish> ranked = new ArrayList<>(dishes == null ? Collections.<Dish>emptyList() : dishes);
        ranked.sort((left, right) -> {
            int scoreOrder = Integer.compare(scorer.score(right, criteria, favoriteIds, recentIds), scorer.score(left, criteria, favoriteIds, recentIds));
            if (scoreOrder != 0) return scoreOrder;
            Long leftId = left.getId() == null ? Long.MAX_VALUE : left.getId();
            Long rightId = right.getId() == null ? Long.MAX_VALUE : right.getId();
            return leftId.compareTo(rightId);
        });
        return ranked;
    }

    private boolean containsExcludedIngredient(Dish dish, List<String> exclusions) {
        if (exclusions == null || exclusions.isEmpty()) return false;
        String searchable = ((dish.getCl() == null ? "" : dish.getCl()) + " "
                + (dish.getIngredientsAmounts() == null ? "" : dish.getIngredientsAmounts())).toLowerCase();
        for (String excluded : exclusions) {
            if (excluded != null && !excluded.trim().isEmpty() && searchable.contains(excluded.trim().toLowerCase())) return true;
        }
        return false;
    }

    private Set<String> splitCodes(String value) {
        Set<String> result = new HashSet<>();
        if (value == null) return result;
        for (String code : value.split(",")) {
            if (!code.trim().isEmpty()) result.add(code.trim().toUpperCase());
        }
        return result;
    }

    private void fillPlanFromPool(List<Dish> planDishes, Set<String> usedNames, List<Dish> pool, Integer need) {
        int remaining = valueOrDefault(need, 0);
        if (remaining <= 0 || pool == null) return;
        while (remaining > 0) {
            List<Dish> available = new ArrayList<>();
            for (Dish dish : pool) {
                if (dish != null && dish.getName() != null && !usedNames.contains(dish.getName())) available.add(dish);
            }
            if (available.isEmpty()) break;
            int totalWeight = available.size() * (available.size() + 1) / 2;
            int draw = random.nextInt(totalWeight);
            int cumulative = 0;
            Dish selected = available.get(available.size() - 1);
            for (int index = 0; index < available.size(); index++) {
                cumulative += available.size() - index;
                if (draw < cumulative) {
                    selected = available.get(index);
                    break;
                }
            }
            if (addDishIfUnused(planDishes, usedNames, selected)) remaining--;
        }
    }

    public List<String> selectedDishWarnings(RecommendRequest request,
                                             UserPreferenceDTO preferences,
                                             Long userId) {
        RecommendRequest req = request == null ? new RecommendRequest() : request;
        List<Dish> requested = req.getUserSelectedDishes();
        if (requested == null || requested.isEmpty()) return Collections.emptyList();
        List<Dish> eligible = eligibleSelectedDishes(req, preferences, userId);
        Set<Long> eligibleIds = new HashSet<>();
        Set<String> eligibleNames = new HashSet<>();
        for (Dish dish : eligible) {
            if (dish.getId() != null) eligibleIds.add(dish.getId());
            if (dish.getName() != null) eligibleNames.add(dish.getName());
        }
        int removed = 0;
        for (Dish dish : requested) {
            boolean kept = dish != null && ((dish.getId() != null && eligibleIds.contains(dish.getId()))
                    || (dish.getId() == null && dish.getName() != null && eligibleNames.contains(dish.getName())));
            if (!kept) removed++;
        }
        if (removed == 0) return Collections.emptyList();
        return Collections.singletonList("已移除 " + removed + " 道与长期忌口、时长限制或账号权限冲突的已选菜品。");
    }

    private List<Dish> eligibleSelectedDishes(RecommendRequest request,
                                              UserPreferenceDTO preferences,
                                              Long userId) {
        List<Dish> selected = resolveSelectedDishes(request == null ? null : request.getUserSelectedDishes(), userId);
        EffectiveRecommendationCriteria permanentCriteria = criteriaResolver.resolve(null, preferences, false);
        return filterCandidates(selected, permanentCriteria);
    }

    private List<Dish> resolveSelectedDishes(List<Dish> selected, Long userId) {
        if (selected == null || selected.isEmpty()) return Collections.emptyList();
        if (userId == null) return new ArrayList<>(selected);
        List<Long> ids = new ArrayList<>();
        for (Dish dish : selected) {
            if (dish != null && dish.getId() != null && !ids.contains(dish.getId())) ids.add(dish.getId());
        }
        if (ids.isEmpty()) return Collections.emptyList();
        List<Dish> loaded = dishMapper.selectByIdsForUser(ids, userId);
        Map<Long, Dish> byId = new LinkedHashMap<>();
        if (loaded != null) {
            for (Dish dish : loaded) {
                if (dish != null && dish.getId() != null) byId.put(dish.getId(), dish);
            }
        }
        List<Dish> result = new ArrayList<>();
        for (Long id : ids) {
            Dish dish = byId.get(id);
            if (dish != null) result.add(dish);
        }
        return result;
    }

    private boolean addDishIfUnused(List<Dish> planDishes, Set<String> usedNames, Dish dish) {
        if (dish == null || dish.getName() == null || !usedNames.add(dish.getName())) return false;
        planDishes.add(dish);
        return true;
    }

    private int valueOrDefault(Integer value, int defaultValue) {
        return Math.max(0, value == null ? defaultValue : value);
    }
}
