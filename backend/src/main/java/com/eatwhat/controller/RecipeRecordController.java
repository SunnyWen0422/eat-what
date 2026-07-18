package com.eatwhat.controller;

import com.eatwhat.dto.StatisticsDTO;
import com.eatwhat.entity.RecipeRecord;
import com.eatwhat.service.RecipeRecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

@RestController
@RequestMapping("/recipe-records")
public class RecipeRecordController {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    @Autowired
    private RecipeRecordService recipeRecordService;

    private final SimpleDateFormat dateFormat;

    public RecipeRecordController() {
        this.dateFormat = new SimpleDateFormat("yyyy-MM-dd");
        this.dateFormat.setLenient(false);
        this.dateFormat.setTimeZone(TimeZone.getTimeZone("GMT+8"));
    }

    @PostMapping
    public ResponseEntity<?> saveRecipeRecord(@RequestBody RecipeRecord record, HttpServletRequest request) {
        if (record.getMealType() == null || record.getMealType().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "mealType不能为空"));
        }
        if (record.getRecipeName() == null || record.getRecipeName().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "recipeName不能为空"));
        }

        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).body(java.util.Collections.singletonMap("error", "用户未登录"));
        }
        record.setUserId((Long) currentUserId);

        if (record.getRecordDateString() == null || record.getRecordDateString().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "日期不能为空"));
        }

        try {
            LocalDate localDate = LocalDate.parse(record.getRecordDateString(), DATE_FORMAT);
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.clear();
            cal.set(localDate.getYear(), localDate.getMonthValue() - 1, localDate.getDayOfMonth(), 0, 0, 0);
            record.setRecordDate(cal.getTime());
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "日期格式错误，应为 yyyy-MM-dd"));
        }

        if (record.getDishIds() != null) {
            java.util.List<Long> validDishIds = new java.util.ArrayList<>();
            for (Object id : record.getDishIds()) {
                if (id instanceof Number) {
                    validDishIds.add(((Number) id).longValue());
                } else if (id instanceof String) {
                    try {
                        validDishIds.add(Long.parseLong((String) id));
                    } catch (NumberFormatException ignored) {
                        // Ignore bad ids.
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

    @GetMapping("/date/{date}")
    public ResponseEntity<List<RecipeRecord>> getRecordsByDate(
            @PathVariable String date,
            HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }
        try {
            LocalDate.parse(date, DATE_FORMAT);
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().build();
        }
        List<RecipeRecord> records = recipeRecordService.getRecordsByDate((Long) currentUserId, date);
        return ResponseEntity.ok(records);
    }

    @GetMapping("/dates")
    public ResponseEntity<List<Date>> getRecordDatesInRange(
            @RequestParam String startDate,
            @RequestParam String endDate,
            HttpServletRequest request) {
        try {
            Object currentUserId = request.getAttribute("currentUserId");
            if (currentUserId == null) {
                return ResponseEntity.status(401).build();
            }

            Date start = parseStrictDate(startDate);
            Date end = parseStrictDate(endDate);
            List<Date> dates = recipeRecordService.getRecordDatesInRange((Long) currentUserId, start, end);
            return ResponseEntity.ok(dates);
        } catch (ParseException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateRecipeRecord(@PathVariable Long id, @RequestBody RecipeRecord record, HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        record.setId(id);
        record.setUserId((Long) currentUserId);

        boolean success = recipeRecordService.updateRecipeRecord(record);
        if (success) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRecipeRecord(@PathVariable Long id, HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        boolean success = recipeRecordService.deleteRecipeRecord(id, (Long) currentUserId);
        if (success) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/date/{date}/meal/{mealType}")
    public ResponseEntity<?> deleteRecordByDateAndMeal(
            @PathVariable String date,
            @PathVariable String mealType,
            HttpServletRequest request) {
        Object currentUserId = request.getAttribute("currentUserId");
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            LocalDate.parse(date, DATE_FORMAT);
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().build();
        }

        boolean success = recipeRecordService.deleteRecordByDateAndMeal((Long) currentUserId, date, mealType);
        if (success) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/statistics")
    public ResponseEntity<StatisticsDTO> getStatistics(
            @RequestParam String startDate,
            @RequestParam String endDate,
            HttpServletRequest request) {
        try {
            Object currentUserId = request.getAttribute("currentUserId");
            if (currentUserId == null) {
                StatisticsDTO errorDto = new StatisticsDTO();
                errorDto.setSuccess(false);
                return ResponseEntity.status(401).body(errorDto);
            }

            Date start = parseStrictDate(startDate);
            Date end = parseStrictDate(endDate);
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

    private Date parseStrictDate(String value) throws ParseException {
        try {
            LocalDate localDate = LocalDate.parse(value, DATE_FORMAT);
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.clear();
            cal.set(localDate.getYear(), localDate.getMonthValue() - 1, localDate.getDayOfMonth(), 0, 0, 0);
            return cal.getTime();
        } catch (DateTimeParseException e) {
            throw new ParseException("Invalid date: " + value, 0);
        }
    }
}
