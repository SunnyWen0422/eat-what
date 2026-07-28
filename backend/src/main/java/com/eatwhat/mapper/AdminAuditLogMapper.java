package com.eatwhat.mapper;

import com.eatwhat.entity.AdminAuditLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AdminAuditLogMapper {
    @Insert("INSERT INTO admin_audit_log " +
            "(admin_user_id, target_user_id, target_dish_id, action, result, detail_json, request_id) " +
            "VALUES (#{adminUserId}, #{targetUserId}, #{targetDishId}, #{action}, #{result}, " +
            "#{detailJson}, #{requestId})")
    int insert(AdminAuditLog log);

    @Select({
            "<script>",
            "SELECT id, admin_user_id AS adminUserId, target_user_id AS targetUserId, ",
            "target_dish_id AS targetDishId, action, result, detail_json AS detailJson, ",
            "request_id AS requestId, created_at AS createdAt FROM admin_audit_log ",
            "<where>",
            "<if test='adminId != null'>AND admin_user_id = #{adminId}</if>",
            "<if test='targetUserId != null'>AND target_user_id = #{targetUserId}</if>",
            "<if test='action != null and action != &quot;&quot;'>AND action = #{action}</if>",
            "<if test='from != null and from != &quot;&quot;'>AND created_at &gt;= CONCAT(#{from}, ' 00:00:00')</if>",
            "<if test='to != null and to != &quot;&quot;'>AND created_at &lt; DATE_ADD(CONCAT(#{to}, ' 00:00:00'), INTERVAL 1 DAY)</if>",
            "</where>",
            "ORDER BY created_at DESC, id DESC LIMIT #{limit} OFFSET #{offset}",
            "</script>"
    })
    List<AdminAuditLog> selectPage(@Param("adminId") Long adminId,
                                   @Param("targetUserId") Long targetUserId,
                                   @Param("action") String action,
                                   @Param("from") String from,
                                   @Param("to") String to,
                                   @Param("limit") int limit,
                                   @Param("offset") int offset);

    @Select({
            "<script>",
            "SELECT COUNT(*) FROM admin_audit_log ",
            "<where>",
            "<if test='adminId != null'>AND admin_user_id = #{adminId}</if>",
            "<if test='targetUserId != null'>AND target_user_id = #{targetUserId}</if>",
            "<if test='action != null and action != &quot;&quot;'>AND action = #{action}</if>",
            "<if test='from != null and from != &quot;&quot;'>AND created_at &gt;= CONCAT(#{from}, ' 00:00:00')</if>",
            "<if test='to != null and to != &quot;&quot;'>AND created_at &lt; DATE_ADD(CONCAT(#{to}, ' 00:00:00'), INTERVAL 1 DAY)</if>",
            "</where>",
            "</script>"
    })
    int count(@Param("adminId") Long adminId,
              @Param("targetUserId") Long targetUserId,
              @Param("action") String action,
              @Param("from") String from,
              @Param("to") String to);
}
