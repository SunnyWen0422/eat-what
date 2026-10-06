package com.eatwhat.mapper;
import com.eatwhat.dto.IngredientQuote;
import org.apache.ibatis.annotations.*;
import java.util.*;
@Mapper
public interface IngredientPriceMapper {
    @Select("SELECT p.*,p.source_name AS sourceName,p.unit_quantity AS unitQuantity,p.unit_code AS unitCode,p.unit_family AS unitFamily,CAST(p.quote_date AS CHAR) AS quoteDate,b.source_url AS sourceUrl FROM ingredient_price p JOIN ingredient_price_batch b ON b.id=p.batch_id WHERE b.status='PUBLISHED' AND p.source_name=COALESCE((SELECT source_name FROM ingredient_price_mapping WHERE canonical_name=#{name} AND variant=#{variant}),#{name}) AND p.variant=COALESCE((SELECT source_variant FROM ingredient_price_mapping WHERE canonical_name=#{name} AND variant=#{variant}),#{variant}) ORDER BY p.quote_date DESC,b.id DESC LIMIT 1")
    IngredientQuote latest(@Param("name") String name,@Param("variant") String variant);
    @Select("SELECT id FROM ingredient_price_batch WHERE content_hash=#{hash}")
    Long findBatch(String hash);
    @Insert("INSERT INTO ingredient_price_batch(source_url,quote_date,content_hash,raw_content,status,audit_json) VALUES(#{sourceUrl},#{quoteDate},#{hash},#{raw},'PUBLISHED',#{audit})")
    @Options(useGeneratedKeys=true,keyProperty="id")
    int batch(Map<String,Object> batch);
    @Insert("INSERT INTO ingredient_price(batch_id,source_name,variant,price,unit_quantity,unit_code,unit_family,quote_date) VALUES(#{batchId},#{sourceName},#{variant},#{price},#{unitQuantity},#{unitCode},#{unitFamily},#{quoteDate})")
    int quote(IngredientQuote quote);
    @Insert("INSERT INTO ingredient_price_collection(status,message) VALUES(#{status},#{message})")
    int log(@Param("status") String status,@Param("message") String message);
    @Insert("INSERT INTO ingredient_price_mapping(canonical_name,variant,source_name,source_variant) VALUES(#{canonicalName},#{normalizedVariant},#{sourceName},#{variant}) ON DUPLICATE KEY UPDATE source_name=VALUES(source_name),source_variant=VALUES(source_variant)")
    int mapping(IngredientQuote mapping);
}
