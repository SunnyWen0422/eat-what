package com.eatwhat.service;

import com.eatwhat.entity.MealConsumption;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** A freshly calculated view of owned source records, not a persisted report archive. */
final class DietReviewReport {
    static final String CALCULATION_VERSION = "actual-diet-v1";
    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final ObjectMapper json;
    private final DietReviewCalculator calculator;

    DietReviewReport(ObjectMapper json, DietReviewCalculator calculator) {
        this.json = json;
        this.calculator = calculator;
    }

    Map<String,Object> build(Long userId, List<MealConsumption> meals, List<RecipeRecord> plans,
                             LocalDate start, LocalDate end, Instant generatedAt) {
        LocalDate today = generatedAt.atZone(ZONE).toLocalDate();
        List<MealConsumption> ordered = new ArrayList<>(meals);
        ordered.sort(Comparator.comparing(MealConsumption::getMealDate)
            .thenComparing(MealConsumption::getMealType).thenComparing(m -> String.valueOf(m.getId())));
        Map<String,Object> result = calculator.calculate(ordered, plans, today);
        List<Map<String,Object>> actualSources = new ArrayList<>(), planSources = new ArrayList<>(), details = new ArrayList<>();
        Set<String> recordedDays = new HashSet<>();
        int skipped = 0, unrecorded = 0, freeText = 0, noDishes = 0;
        for (MealConsumption meal : ordered) {
            List<Map<String,Object>> dishes = readDishes(meal.getActualDishesJson());
            Map<String,Object> row = values("id", meal.getId(), "revision", meal.getRevision(),
                "mealDate", meal.getMealDate(), "mealType", meal.getMealType(), "status", meal.getStatus(),
                "actualDishes", dishes, "sourceRecordId", meal.getSourceRecordId());
            Map<String,Object> source = new LinkedHashMap<>(row);
            source.put("plannedSnapshot", readSnapshot(meal.getPlannedSnapshotJson()));
            actualSources.add(source);
            LocalDate day = LocalDate.parse(meal.getMealDate());
            if (!day.isAfter(today) && !day.isBefore(start) && !day.isAfter(end)) recordedDays.add(meal.getMealDate());
            if ("skipped".equals(meal.getStatus())) skipped++;
            if ("unrecorded".equals(meal.getStatus())) unrecorded++;
            if (!"eaten".equals(meal.getStatus())) continue;
            if (dishes.isEmpty()) noDishes++;
            for (Map<String,Object> dish : dishes) if (dish.get("dishId") == null) freeText++;
            row.put("sourceUrl", "/pages/calendar-detail/calendar-detail?date=" + meal.getMealDate() + "&mealType=" + meal.getMealType());
            details.add(row);
        }
        for (RecipeRecord plan : plans) {
            planSources.add(values("id", plan.getId(), "revision", plan.getRevision(), "recordDate", plan.calendarDay(),
                "mealType", plan.getMealType(), "recordOrigin", plan.getRecordOrigin(), "recipeName", plan.getRecipeName(),
                "dishIds", plan.getDishIds(), "targetPeople", plan.getTargetPeople()));
        }
        String fingerprint = WorkflowRequestHash.sha256(encode(values("consumptions", sortedSources(actualSources), "plans", sortedSources(planSources))));
        String identity = WorkflowRequestHash.sha256(encode(values("userId", userId, "startDate", start.toString(), "endDate", end.toString(),
            "timezone", ZONE.getId(), "executionAsOfDate", today.minusDays(1).toString(), "sourceFingerprint", fingerprint, "calculationVersion", CALCULATION_VERSION)));
        Map<String,Object> metadata = values("reportId", "diet-report-" + identity, "startDate", start.toString(), "endDate", end.toString(),
            "timezone", ZONE.getId(), "generatedAt", DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(generatedAt.atZone(ZONE)),
            "executionAsOfDate", today.minusDays(1).toString(), "sourceFingerprint", fingerprint,
            "calculationVersion", CALCULATION_VERSION, "basis", "explicit_eaten", "persisted", false);
        LocalDate through = end.isBefore(today) ? end : today;
        int observedDays = through.isBefore(start) ? 0 : (int) ChronoUnit.DAYS.between(start, through) + 1;
        Map<String,Object> completeness = values("observedDays", observedDays,
            "observedThroughDate", observedDays == 0 ? null : through.toString(),
            "daysWithActualRecord", recordedDays.size(), "daysWithoutActualRecord", observedDays - recordedDays.size(),
            "explicitSkippedMeals", skipped, "explicitUnrecordedMeals", unrecorded,
            "freeTextEntryCount", freeText, "unclassifiedCount", result.get("unclassifiedCount"),
            "actualMealsWithoutDishes", noDishes, "nutritionAvailable", false,
            "description", "仅描述已有记录和缺失，不假设每日应吃几餐；未记录不等于未吃。没有可靠食用份量，不计算营养摄入或评分。");
        Map<String,Object> frequent = values("dishes", result.get("popularDishes"), "basis", "known_dish_id_once_per_eaten_meal");
        Map<String,Object> blocks = values(
            "overview", select(result, "mealCount", "recordedDays", "uniqueDishCount", "entryCount", "dailyMeals"),
            "actualDetails", values("records", details, "basis", "explicit_eaten_snapshots"),
            "frequentDishes", frequent,
            "categoryCounts", select(result, "categories", "entryCount", "classifiedCount", "unclassifiedCount"),
            "planExecution", select(result, "plannedMealsDue", "plannedMealsEaten", "plannedMealsFollowed", "plannedMealsChanged", "skippedMeals", "unconfirmedMeals"),
            "completeness", completeness);
        result.put("metadata", metadata);
        result.put("blocks", blocks);
        // Compatibility only; the six blocks are the report contract.
        result.put("consumptions", ordered);
        return result;
    }

    private List<Map<String,Object>> readDishes(String encoded) {
        try { return json.readValue(encoded, new TypeReference<List<Map<String,Object>>>() {}); }
        catch (Exception e) { throw new IllegalStateException("实际用餐快照无法读取", e); }
    }
    private Map<String,Object> readSnapshot(String encoded) {
        if (encoded == null) return null;
        try { return json.readValue(encoded, new TypeReference<Map<String,Object>>() {}); }
        catch (Exception e) { throw new IllegalStateException("计划快照无法读取", e); }
    }
    private List<Object> sortedSources(List<Map<String,Object>> rows) {
        List<Object> canonical = new ArrayList<>();
        for (Map<String,Object> row : rows) canonical.add(canonical(row));
        canonical.sort(Comparator.comparing(this::encode));
        return canonical;
    }
    private Object canonical(Object value) {
        if (value instanceof Map) {
            Map<String,Object> sorted = new TreeMap<>();
            ((Map<?,?>)value).forEach((key, item) -> sorted.put(String.valueOf(key), canonical(item)));
            return sorted;
        }
        if (value instanceof List) {
            List<Object> entries = new ArrayList<>();
            for (Object item : (List<?>)value) entries.add(canonical(item));
            return entries;
        }
        return value;
    }
    private String encode(Object value) {
        try { return json.writeValueAsString(canonical(value)); }
        catch (Exception e) { throw new IllegalStateException("报告来源无法序列化", e); }
    }
    private static Map<String,Object> select(Map<String,Object> source, String... fields) {
        Map<String,Object> selected = new LinkedHashMap<>();
        for (String field : fields) selected.put(field, source.get(field));
        return selected;
    }
    private static Map<String,Object> values(Object... pairs) {
        Map<String,Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String)pairs[i], pairs[i + 1]);
        return result;
    }
}
