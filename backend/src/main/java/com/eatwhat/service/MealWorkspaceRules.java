package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.entity.Dish;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;

/** Pure rules; quantities and persistent business writes stay in their existing services. */
public final class MealWorkspaceRules {
    private static final ObjectMapper JSON = new ObjectMapper().configure(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true).configure(com.fasterxml.jackson.databind.MapperFeature.SORT_PROPERTIES_ALPHABETICALLY,true);
    private MealWorkspaceRules() { }

    public static MealContext normalize(MealContext c) {
        if (c == null) throw new IllegalArgumentException("请提供本餐条件");
        try { c.setDate(LocalDate.parse(c.getDate()).toString()); } catch(Exception e) { throw new IllegalArgumentException("日期格式应为 yyyy-MM-dd"); }
        if (!Arrays.asList("breakfast", "lunch", "dinner").contains(c.getMealType()))
            throw new IllegalArgumentException("餐次无效");
        if (c.getPeople() == null || c.getPeople() < 1 || c.getPeople() > 50)
            throw new IllegalArgumentException("人数应为 1 至 50");
        if (!Arrays.asList("auto", "manual").contains(c.getCompositionMode()))
            throw new IllegalArgumentException("搭配模式无效");
        if (c.getRequirements() == null) c.setRequirements("");
        if (c.getRequirements().length() > 2000) throw new IllegalArgumentException("本餐要求最多 2000 字");
        if (c.getOwnedIngredients() == null) c.setOwnedIngredients(new ArrayList<>());
        if (c.getOwnedIngredients().size() > 30 || c.getOwnedIngredients().stream().anyMatch(v -> v == null || v.length() > 40))
            throw new IllegalArgumentException("已有食材数量或长度超限");
        if (c.getCriteria() == null) c.setCriteria(new RecommendationCriteria());
        if (c.getTotalCookMinutes() != null && (c.getTotalCookMinutes() < 1 || c.getTotalCookMinutes() > 480))
            throw new IllegalArgumentException("整餐用时应为 1 至 480 分钟");
        if ("auto".equals(c.getCompositionMode())) {
            Map<String, Integer> counts = new LinkedHashMap<>();
            if ("breakfast".equals(c.getMealType())) {
                counts.put("staple", c.getPeople() < 5 ? 1 : 2);
                counts.put("side", c.getPeople() < 3 ? 1 : 2);
            } else {
                int n = Math.min(10, (c.getPeople() + 1) / 2 + 1);
                counts.put("meat", n / 2); counts.put("veg", n - n / 2);
            }
            c.setCounts(counts);
        } else {
            if (c.getCounts() == null || c.getCounts().isEmpty()) throw new IllegalArgumentException("请选择菜数");
            int n = 0;
            for (Map.Entry<String, Integer> item : c.getCounts().entrySet()) {
                if (!Arrays.asList("meat", "veg", "soup", "staple", "dessert", "side").contains(item.getKey())
                        || item.getValue() == null || item.getValue() < 0 || item.getValue() > 10)
                    throw new IllegalArgumentException("菜数无效");
                n += item.getValue();
            }
            if (n < 1 || n > 10) throw new IllegalArgumentException("一餐请选择 1 至 10 道菜");
        }
        return c;
    }

    public static String contextFingerprint(MealContext c) {
        try { return com.eatwhat.util.WorkflowRequestHash.sha256(JSON.writeValueAsString(c)); }
        catch(Exception e) { throw new IllegalStateException("本餐条件无法校验",e); }
    }
    public static boolean sameRecipe(Dish a,Dish b) {
        if(a==null || b==null)return false;
        return recipeValues(a).equals(recipeValues(b));
    }
    private static List<Object> recipeValues(Dish d) {
        List<Object> values=new ArrayList<>(Arrays.asList(d.getId(),d.getName(),d.getType(),d.getCl(),d.getFl(),d.getStep(),d.getSteps(),d.getStepImages(),d.getIngredientsAmounts(),d.getTips(),d.getMethods(),d.getCuisineCode(),d.getTagCodes(),d.getCookMinutes()));
        values.replaceAll(v->v==null?"":v);return values;
    }
    public static String requirementsFingerprint(MealContext c) { return com.eatwhat.util.WorkflowRequestHash.sha256(c.getRequirements().trim()); }
    public static boolean understandsRequirements(PlanDraft draft,MealContext c) { return c.getRequirements().trim().isEmpty() || Objects.equals(draft.getRequirementsFingerprint(),requirementsFingerprint(c)); }
    public static boolean matchesContext(PlanDraft draft,MealContext context) { return Objects.equals(draft.getContextFingerprint(),contextFingerprint(context)); }

    public static PlanDraft copy(PlanDraft value) { return JSON.convertValue(value, PlanDraft.class); }

    public static PlanDraft command(PlanDraft current, String command, Long dishId, Dish replacement) {
        PlanDraft next = copy(current);
        if ("undo".equals(command)) {
            if (next.getHistory().isEmpty()) throw new IllegalArgumentException("没有可以撤销的调整");
            PlanDraft restored = copy(next.getHistory().remove(next.getHistory().size() - 1));
            restored.setAdjustedBeforeConfirmation(current.isAdjustedBeforeConfirmation() || restored.isAdjustedBeforeConfirmation());
            restored.setHistory(next.getHistory()); restored.setPlanVersion(current.getPlanVersion() + 1);
            return restored;
        }
        int index = -1;
        for (int i = 0; i < next.getDishes().size(); i++) if (Objects.equals(dishId, next.getDishes().get(i).getId())) index = i;
        if (index < 0) throw new IllegalArgumentException("菜品已不在当前方案");
        if ("keep".equals(command)) next.getLockedDishIds().add(dishId);
        else if ("release".equals(command)) next.getLockedDishIds().remove(dishId);
        else if ("replace".equals(command)) {
            if (next.getLockedDishIds().contains(dishId)) throw new IllegalArgumentException("请先解除保留");
            if (replacement == null) throw new IllegalArgumentException("没有满足条件的替换菜品");
            next.getDishes().set(index, replacement);next.setAdjustedBeforeConfirmation(true);
        } else throw new IllegalArgumentException("方案操作无效");
        return advance(current, next);
    }

    public static PlanDraft advance(PlanDraft current, PlanDraft next) {
        List<PlanDraft> history = new ArrayList<>(current.getHistory());
        if (!current.getDishes().isEmpty()) {
            PlanDraft snapshot = copy(current); snapshot.setHistory(new ArrayList<>()); history.add(snapshot);
        }
        if (history.size() > 10) history.remove(0);
        next.setAdjustedBeforeConfirmation(current.isAdjustedBeforeConfirmation() || next.isAdjustedBeforeConfirmation());
        next.setHistory(history); next.setPlanVersion(current.getPlanVersion() + 1);
        next.setTotalCookMinutes(totalMinutes(next.getDishes()));
        return next;
    }

    public static Integer totalMinutes(List<Dish> dishes) {
        if (dishes == null || dishes.isEmpty()) return null;
        int total = 0;
        for (Dish dish : dishes) {
            if (dish.getCookMinutes() == null || dish.getCookMinutes() <= 0) return null;
            total += dish.getCookMinutes();
        }
        return total;
    }
}
