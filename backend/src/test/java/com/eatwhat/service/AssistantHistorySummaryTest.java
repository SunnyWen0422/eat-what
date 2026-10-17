package com.eatwhat.service;
import com.eatwhat.dto.AssistantV4Contract.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class AssistantHistorySummaryTest {
 @Test void request_title_and_pending_status_do_not_claim_business_success(){SessionSummary row=new SessionSummary();row.setTitle("保存明晚菜单");row.setPreview("较早的已完成反馈");row.setLastStatus("awaiting_confirmation");AssistantHistorySummary.normalize(row);assertEquals("保存明晚菜单",row.getTitle());assertTrue(row.getPreview().contains("确认"));assertFalse(row.getPreview().contains("已完成"));}
 @Test void empty_old_summaries_have_no_invented_title_or_receipt(){SessionSummary row=new SessionSummary();row.setLastStatus("completed");AssistantHistorySummary.normalize(row);assertNull(row.getTitle());assertNull(row.getPreview());}
 @Test void partial_and_failed_results_have_distinct_explanations(){SessionSummary row=new SessionSummary();row.setLastStatus("partially_completed");AssistantHistorySummary.normalize(row);assertTrue(row.getPreview().contains("部分"));row.setLastStatus("failed");AssistantHistorySummary.normalize(row);assertTrue(row.getPreview().contains("未完成"));}
}
