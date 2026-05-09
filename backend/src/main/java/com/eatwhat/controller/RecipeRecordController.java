package com.eatwhat.controller;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.service.RecipeRecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

/**
 * 菜谱记录控制器
 */
@RestController
@RequestMapping("/recipe-records")
public class RecipeRecordController {

    @Autowired
    private RecipeRecordService recipeRecordService;

    private final SimpleDateFormat dateFormat;
    
    public RecipeRecordController() {
        this.dateFormat = new SimpleDateFormat("yyyy-MM-dd");
        this.dateFormat.setTimeZone(TimeZone.getTimeZone("GMT+8"));
    }

    /**
     * 保存菜谱记录
     * POST /api/recipe-records
     */
    @PostMapping
    public ResponseEntity<?> saveRecipeRecord(@RequestBody RecipeRecord record, HttpServletRequest request) {
        // 验证必填字段
        if (record.getMealType() == null || record.getMealType().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "mealType不能为空"));
        }
        if (record.getRecipeName() == null || record.getRecipeName().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "recipeName不能为空"));
        }

        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).body(java.util.Collections.singletonMap("error", "用户未登录"));
        }
        record.setUserId((Long) currentUserId);

        // 处理日期转换：将 recordDateString 转换为 recordDate（Date 对象）
        // 重要：让 recordDate 的 getTime() 返回 UTC 午夜的时间戳
        // 这样 MySQL (serverTimezone=Asia/Shanghai) 会正确存储北京时间日期
        if (record.getRecordDateString() == null || record.getRecordDateString().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "日期不能为空"));
        }
        
        try {
            // 解析 "2026-04-29" 格式，构造 UTC 午夜的 Date 对象
            // 这样 MySQL 的 DATE 列会正确存储日期（因为 serverTimezone=Asia/Shanghai）
            String[] parts = record.getRecordDateString().split("-");
            int year = Integer.parseInt(parts[0]);
            int month = Integer.parseInt(parts[1]) - 1; // Calendar 月份是 0-based
            int day = Integer.parseInt(parts[2]);
            
            java.util.Calendar cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
            cal.set(year, month, day, 0, 0, 0);
            cal.set(java.util.Calendar.MILLISECOND, 0);
            record.setRecordDate(cal.getTime());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "日期格式错误，应为 yyyy-MM-dd"));
        }

        // 验证并清理dishIds数组
        if (record.getDishIds() != null) {
            java.util.List<Long> validDishIds = new java.util.ArrayList<>();
            for (Object id : record.getDishIds()) {
                if (id != null) {
                    if (id instanceof Number) {
                        validDishIds.add(((Number) id).longValue());
                    } else if (id instanceof String) {
                        try {
                            validDishIds.add(Long.parseLong((String) id));
                        } catch (NumberFormatException ignored) {
                            // 跳过无效的ID
                        }
                    }
                }
            }
            record.setDishIds(validDishIds);
        }

        try {
            RecipeRecord saved = recipeRecordService.saveRecipeRecord(record);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(java.util.Collections.singletonMap("error", "保存失败"));
        }
    }

    /**
     * 获取指定日期的菜谱记录
     * GET /api/recipe-records/date/{date}
     */
    @GetMapping("/date/{date}")
    public ResponseEntity<List<RecipeRecord>> getRecordsByDate(
            @PathVariable String date,
            HttpServletRequest request) {

        // 直接使用字符串日期，避免 Date + 时区转换问题
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        List<RecipeRecord> records = recipeRecordService.getRecordsByDate((Long) currentUserId, date);
        return ResponseEntity.ok(records);
    }

    /**
     * 获取日期范围内的记录日期
     * GET /api/recipe-records/dates?startDate=2024-01-01&endDate=2024-01-31
     */
    @GetMapping("/dates")
    public ResponseEntity<List<Date>> getRecordDatesInRange(
            @RequestParam String startDate,
            @RequestParam String endDate,
            HttpServletRequest request) {

        try {
            // 从token获取用户ID（拦截器已验证）
            Object currentUserId = request.getAttribute("currentUserId");
            if (currentUserId == null) {
                return ResponseEntity.status(401).build();
            }
            
            Date start = dateFormat.parse(startDate);
            Date end = dateFormat.parse(endDate);

            List<Date> dates = recipeRecordService.getRecordDatesInRange((Long) currentUserId, start, end);

            return ResponseEntity.ok(dates);
        } catch (ParseException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * 更新菜谱记录
     * PUT /api/recipe-records/{id}
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateRecipeRecord(@PathVariable Long id, @RequestBody RecipeRecord record, HttpServletRequest request) {
        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        
        record.setId(id);
        record.setUserId((Long) currentUserId);

        boolean success = recipeRecordService.updateRecipeRecord(record);
        if (success) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 删除菜谱记录
     * DELETE /api/recipe-records/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRecipeRecord(@PathVariable Long id, HttpServletRequest request) {
        // 从token获取用户ID（拦截器已验证）
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        boolean success = recipeRecordService.deleteRecipeRecord(id, (Long) currentUserId);
        if (success) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 删除指定日期和餐次的记录
     * DELETE /api/recipe-records/date/{date}/meal/{mealType}
     */
    @DeleteMapping("/date/{date}/meal/{mealType}")
    public ResponseEntity<?> deleteRecordByDateAndMeal(
            @PathVariable String date,
            @PathVariable String mealType,
            HttpServletRequest request) {

        // 直接使用字符串日期
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        boolean success = recipeRecordService.deleteRecordByDateAndMeal((Long) currentUserId, date, mealType);
        if (success) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 获取饮食统计数据
     * GET /api/recipe-records/statistics?startDate=2024-01-01&endDate=2024-01-31
     */
    @GetMapping("/statistics")
    public ResponseEntity<StatisticsDTO> getStatistics(
            @RequestParam String startDate,
            @RequestParam String endDate,
            HttpServletRequest request) {

        try {
            // 从token获取用户ID（拦截器已验证）
            Object currentUserId = request.getAttribute("currentUserId");
            if (currentUserId == null) {
                StatisticsDTO errorDto = new StatisticsDTO();
                errorDto.setSuccess(false);
                return ResponseEntity.status(401).body(errorDto);
            }
            
            Date start = dateFormat.parse(startDate);
            Date end = dateFormat.parse(endDate);

            StatisticsDTO statistics = recipeRecordService.getStatistics((Long) currentUserId, start, end);
            return ResponseEntity.ok(statistics);
        } catch (ParseException e) {
            StatisticsDTO errorDto = new StatisticsDTO();
            errorDto.setSuccess(false);
            return ResponseEntity.badRequest().body(errorDto);
        } catch (Exception e) {
            StatisticsDTO errorDto = new StatisticsDTO();
            errorDto.setSuccess(false);
            return ResponseEntity.internalServerError().body(errorDto);
        }
    }
}
