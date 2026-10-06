package com.eatwhat.service;

import com.eatwhat.dto.IngredientQuote;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Component;
import java.io.*;
import java.math.BigDecimal;
import java.util.*;
import java.util.regex.*;

/** Strictly reads a named retail column. Unknown layouts fail closed, never use a wholesale column. */
@Component
public class ShanghaiPriceParser {
    public static class Parsed {
        public final List<IngredientQuote> rows=new ArrayList<>();
        public final Map<String,Object> audit=new LinkedHashMap<>();
    }
    public Parsed parse(byte[] raw,String date) {
        try(HSSFWorkbook workbook=new HSSFWorkbook(new ByteArrayInputStream(raw))) {
            List<List<String>> cells=new ArrayList<>();DataFormatter format=new DataFormatter(Locale.CHINA);
            for(Sheet sheet:workbook) for(Row row:sheet) {
                List<String> values=new ArrayList<>();
                for(int i=0;i<Math.min(row.getLastCellNum(),100);i++) {
                    Cell c=row.getCell(i);
                    if(c!=null && c.getCellType()==CellType.FORMULA) throw new IllegalArgumentException("价格附件包含公式，需要核对后导入");
                    values.add(format.formatCellValue(c).trim());
                }
                cells.add(values);
            }
            return parseRows(cells,date);
        } catch(IllegalArgumentException e) { throw e; }
        catch(Exception e) { throw new IllegalArgumentException("无法解析官方 XLS 附件，请核对文件格式",e); }
    }
    public Parsed parseRows(List<List<String>> rows,String date) {
        Parsed out=new Parsed();Set<String> seen=new HashSet<>();int name=-1,spec=-1,unit=-1,retail=-1,missing=0,duplicates=0,unknown=0,headers=0;
        String defaultUnit="";
        for(List<String> row:rows) {
            String joined=String.join(" ",row);
            Matcher dateInFile=Pattern.compile("(20\\d{2})年\\s*(\\d{1,2})月\\s*(\\d{1,2})日").matcher(joined);
            if(dateInFile.find()) {
                String found=String.format("%s-%02d-%02d",dateInFile.group(1),Integer.parseInt(dateInFile.group(2)),Integer.parseInt(dateInFile.group(3)));
                if(!date.equals(found)) throw new IllegalArgumentException("附件日期与报价日期不一致");
            }
            Matcher global=Pattern.compile("单位[：:]\\s*(元[/／](?:500克|公斤|千克|克|升|毫升))").matcher(joined);
            if(global.find()) defaultUnit=global.group(1);
            int header=find(row,"品种","品名","商品名称","名称");
            if(header>=0) {
                name=header;spec=find(row,"规格","规格等级","等级");unit=find(row,"单位","计价单位");retail=find(row,"平均零售价","零售均价","零售价格","平均零售价格","零售价");headers++;
                if(retail<0) throw new IllegalArgumentException("未识别明确的零售价格列，拒绝使用其他价格列");
                continue;
            }
            if(name<0 || cell(row,name).isEmpty() || joined.startsWith("注") || joined.startsWith("说明")) continue;
            String value=cell(row,retail),label=cell(row,name);
            if(value.isEmpty() || value.matches("[-—/]+")) { missing++;continue; }
            if(!value.matches("\\d+(\\.\\d{1,4})?")) { unknown++;continue; }
            BigDecimal price=new BigDecimal(value);
            if(price.signum()<=0 || price.compareTo(new BigDecimal("1000000"))>=0) throw new IllegalArgumentException("报价异常："+label);
            String u=unit<0?defaultUnit:cell(row,unit);if(u.isEmpty())u=defaultUnit;
            u=u.replace("元/","").replace("元／","").replace("公斤","kg").replace("千克","kg").replace("毫升","ml").replace("克","g").replace("升","l");
            Matcher m=Pattern.compile("(\\d+(?:\\.\\d+)?)?(g|kg|ml|l)").matcher(u);
            if(!m.matches()) { unknown++;continue; }
            String variant=cell(row,spec),key=label+"|"+variant;
            if(!seen.add(key)) { duplicates++;throw new IllegalArgumentException("同一品种规格存在重复报价："+label); }
            if(label.length()>120 || variant.length()>255) throw new IllegalArgumentException("品种或规格过长");
            IngredientQuote q=new IngredientQuote();q.setSourceName(label);q.setVariant(variant);q.setPrice(price);q.setQuoteDate(date);q.setUnitCode(m.group(2));
            q.setUnitQuantity(new BigDecimal(m.group(1)==null?"1":m.group(1)));q.setUnitFamily(m.group(2).contains("g")?"mass":"volume");
            if(q.getUnitQuantity().signum()<=0) throw new IllegalArgumentException("计价单位无效");
            out.rows.add(q);
        }
        if(out.rows.isEmpty()) throw new IllegalArgumentException("没有可验证的零售价格明细，未发布批次");
        out.audit.put("sourceRows",rows.size());out.audit.put("headerSections",headers);out.audit.put("accepted",out.rows.size());out.audit.put("missing",missing);out.audit.put("duplicates",duplicates);out.audit.put("unrecognized",unknown);
        return out;
    }
    private static int find(List<String> row,String... labels) { for(int i=0;i<row.size();i++) for(String label:labels) if(label.equals(row.get(i).replaceAll("\\s+",""))) return i;return -1; }
    private static String cell(List<String> row,int index) { return index<0||index>=row.size()?"":row.get(index).trim(); }
}
