package com.eatwhat.service;

import com.eatwhat.dto.IngredientQuote;
import com.eatwhat.mapper.IngredientPriceMapper;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class ShanghaiPriceService {
    private final IngredientPriceMapper mapper;
    private final ShanghaiPriceParser parser;
    @Value("${shopping-prices.enabled:true}") private boolean enabled = true;
    public ShanghaiPriceService(IngredientPriceMapper mapper, ShanghaiPriceParser parser) { this.mapper=mapper; this.parser=parser; }
    public Map<String,IngredientQuote> query(List<IngredientQuote> items) {
        if(items==null || items.size()>500) throw new IllegalArgumentException("报价查询项目过多");
        Map<String,IngredientQuote> result=new LinkedHashMap<>();
        LocalDate today=LocalDate.now(ZoneId.of("Asia/Shanghai"));
        for(IngredientQuote item:items) {
            if(item==null || item.getIngredientKey()==null || item.getIngredientKey().length()>2200 || item.getCanonicalName()==null || item.getCanonicalName().length()>120 || item.getNormalizedVariant()!=null && item.getNormalizedVariant().length()>255) throw new IllegalArgumentException("食材查询无效");
            IngredientQuote q=enabled ? mapper.latest(item.getCanonicalName(),item.getNormalizedVariant()==null?"":item.getNormalizedVariant()) : null;
            if(q==null) q=new IngredientQuote();
            else { LocalDate date=LocalDate.parse(q.getQuoteDate()); q.setStatus(date.isAfter(today)||date.isBefore(today.minusDays(7)) ? "STALE":"AVAILABLE"); }
            q.setIngredientKey(item.getIngredientKey()); result.put(item.getIngredientKey(),q);
        }
        return result;
    }
    @Transactional
    public Map<String,Object> importFile(byte[] raw,String sourceUrl,String date) throws Exception {
        requireSource(sourceUrl);
        LocalDate quoteDate=LocalDate.parse(date);
        if(quoteDate.isAfter(LocalDate.now(ZoneId.of("Asia/Shanghai")))) throw new IllegalArgumentException("报价日期不能在未来");
        if(raw.length==0 || raw.length>5*1024*1024) throw new IllegalArgumentException("附件大小无效");
        String hash=WorkflowRequestHash.sha256(sourceUrl+"|"+date+"|"+Base64.getEncoder().encodeToString(raw));
        Long existing=mapper.findBatch(hash);
        if(existing!=null) return Collections.singletonMap("batchId",existing);
        ShanghaiPriceParser.Parsed parsed=parser.parse(raw,date);
        Map<String,Object> batch=new LinkedHashMap<>(); batch.put("raw",raw);batch.put("sourceUrl",sourceUrl);batch.put("quoteDate",date);batch.put("hash",hash);batch.put("audit",new ObjectMapper().writeValueAsString(parsed.audit));
        mapper.batch(batch);
        for(IngredientQuote q:parsed.rows) { q.setBatchId(((Number)batch.get("id")).longValue());mapper.quote(q); }
        Map<String,Object> result=new LinkedHashMap<>(parsed.audit);result.put("batchId",batch.get("id"));return result;
    }
    public static void requireSource(String source) {
        try { java.net.URI uri=new java.net.URI(source); if(!"https".equals(uri.getScheme()) || !"fgw.sh.gov.cn".equals(uri.getHost()) || uri.getUserInfo()!=null || uri.getPort()!=-1) throw new Exception(); }
        catch(Exception e) { throw new IllegalArgumentException("来源必须是上海市发改委 HTTPS 官方页面"); }
    }
    @Transactional
    public void saveMapping(IngredientQuote q) {
        if(q.getCanonicalName()==null || q.getSourceName()==null || q.getCanonicalName().trim().isEmpty() || q.getSourceName().trim().isEmpty() || q.getCanonicalName().length()>120 || q.getSourceName().length()>120 || q.getNormalizedVariant()==null || q.getVariant()==null || q.getNormalizedVariant().length()>255 || q.getVariant().length()>255) throw new IllegalArgumentException("映射内容无效");
        mapper.mapping(q);
    }
}
