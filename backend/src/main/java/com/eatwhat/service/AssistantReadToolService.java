package com.eatwhat.service;

import com.eatwhat.dto.*;
import com.eatwhat.dto.AssistantV4Contract.*;
import com.eatwhat.entity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import static com.eatwhat.service.AssistantV4ContextService.*;

/** Lazy, owner-scoped Java reads. Model arguments cannot supply identity, paths, or URLs. */
@Service
public class AssistantReadToolService {
    private static final int SEARCH_RESULT_CHAR_LIMIT=4000;
    public static final List<String> READS=Collections.unmodifiableList(Arrays.asList("search_dishes","search_by_ingredients","get_dish_details","get_dish_methods","read_current_meal","read_calendar","read_shopping","read_actual_diet_review"));
    private final MealWorkspaceService workspaces;private final DishQueryService dishes;private final DishCandidateQueryService candidates;
    private final UserPreferenceService preferences;private final RecommendationMetadataService metadata;private final MealConsumptionService meals;
    private final ShoppingListService shopping;private final ObjectMapper json;
    private org.springframework.transaction.support.TransactionTemplate readTransaction;
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    public void configureReadTransaction(org.springframework.transaction.PlatformTransactionManager manager){
        readTransaction=new org.springframework.transaction.support.TransactionTemplate(manager);
        readTransaction.setReadOnly(true);readTransaction.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public AssistantReadToolService(MealWorkspaceService w,DishQueryService d,DishCandidateQueryService q,UserPreferenceService p,RecommendationMetadataService m,MealConsumptionService a,ShoppingListService s,ObjectMapper j,AssistantCapabilityService capabilities){workspaces=w;dishes=d;candidates=q;preferences=p;metadata=m;meals=a;shopping=s;json=j;for(String name:READS)capabilities.registerRead(name,this::read);}
    @org.springframework.transaction.annotation.Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public ReadResult read(Long user,ToolRead call,TurnScope scope){
        // The registry holds a constructor-time method reference, which bypasses
        // Spring's later AOP proxy. Establish the same boundary on that path.
        if(readTransaction!=null&&!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())return readTransaction.execute(status->readSnapshot(user,call,scope));
        return readSnapshot(user,call,scope);
    }
    private ReadResult readSnapshot(Long user,ToolRead call,TurnScope scope){
        if(user==null||user<1||scope==null||!Objects.equals(user,scope.getUserId())||scope.getWorkspaceId()==null)throw new IllegalArgumentException("查询范围无效，请重新打开助手");
        if(call==null||call.getCallId()==null||call.getCallId().isEmpty()||call.getCallId().length()>100||!READS.contains(call.getName())||call.getArguments()==null)throw new IllegalArgumentException("查询请求无效");
        MealWorkspace w=workspaces.get(user,scope.getWorkspaceId());checkVersions(w,scope.getExpectedWorkspaceRevision(),scope.getExpectedPlanVersion());
        ReadResult result=new ReadResult();result.setCallId(call.getCallId());result.setName(call.getName());Map<String,Object> args=call.getArguments();
        switch(call.getName()){
            case "read_current_meal":fields(args);result.getItems().add(activeMeal(w,user));result.setSourceVersion(w.getRevision()+":"+w.getDraft().getPlanVersion());break;
            case "get_dish_details":fields(args,"dish_ids");detail(user,ids(args.get("dish_ids")),w,scope,result,false);break;
            case "get_dish_methods":fields(args,"dish_id");detail(user,Collections.singletonList(id(args.get("dish_id"))),w,scope,result,true);break;
            case "search_dishes":fields(args,"query","filters","top_k","cursor");search(user,w,scope,args,result,false);break;
            case "search_by_ingredients":fields(args,"ingredients","filters","top_k","cursor");search(user,w,scope,args,result,true);break;
            case "read_calendar":fields(args,"startDate","endDate","cursor");calendar(user,args,result,false);break;
            case "read_actual_diet_review":fields(args,"startDate","endDate","cursor");calendar(user,args,result,true);break;
            case "read_shopping":fields(args,"status","cursor","limit");shopping(user,args,result);break;
            default:throw new IllegalArgumentException("不支持的查询");
        }
        if(result.getSourceVersion()==null)result.setSourceVersion(fingerprint(result.getItems()));return result;
    }
    private void detail(Long user,List<Long> ids,MealWorkspace w,TurnScope scope,ReadResult out,boolean methods){
        RecommendationCriteria hard=new RecommendationCriteriaResolver().resolve(w.getContext().getCriteria(),preferences.get(user),true);
        Map<Long,Dish> available=new HashMap<>();for(Dish d:orEmpty(dishes.getDishesByIdsForUser(ids,user))){checkDish(d,user);if(matches(d,hard,null)&&ids.contains(d.getId()))available.put(d.getId(),d);}
        // Fail the whole detail call; never substitute another recipe for an inaccessible ID.
        for(Long id:ids){Dish d=available.get(id);if(d==null)throw new IllegalArgumentException("菜品不存在、不可访问或不满足本餐限制");Map<String,Object> item=recipe(d,out);if(methods){item.put("steps",d.getSteps()==null?d.getStep():d.getSteps());item.put("methods",d.getMethods());if(item.get("steps")==null)out.getUnknownFields().add("steps:"+id);}out.getItems().add(item);scope.getAuthorizedDishIds().add(id);}
    }
    private void search(Long user,MealWorkspace w,TurnScope scope,Map<String,Object> args,ReadResult out,boolean ingredientsSearch){
        Map<String,Object> filters=object(args.get("filters"));fields(filters,"type","cuisine_codes","include_tag_codes","exclude_tag_codes","excluded_ingredients","max_cook_minutes");
        RecommendationCriteria additional=new RecommendationCriteria();additional.setCuisineCodes(strings(filters.get("cuisine_codes"),false));additional.setIncludeTagCodes(strings(filters.get("include_tag_codes"),false));additional.setExcludeTagCodes(strings(filters.get("exclude_tag_codes"),false));additional.setExcludedIngredients(strings(filters.get("excluded_ingredients"),false));if(filters.containsKey("max_cook_minutes"))additional.setMaxCookMinutes(integer(filters.get("max_cook_minutes"),1,240));
        if(!metadata.validateCriteria(additional).isEmpty())throw new IllegalArgumentException("查询条件包含不支持的代码");
        String type=filters.containsKey("type")?text(filters.get("type"),40):null;if(type!=null&&!TYPES.contains(type))throw new IllegalArgumentException("菜品类别无效");
        RecommendationCriteria hard=new RecommendationCriteriaResolver().resolve(w.getContext().getCriteria(),preferences.get(user),true);
        RecommendationCriteria query=merge(hard,additional);String keyword=args.containsKey("query")?text(args.get("query"),200):null;
        List<String> ingredients=ingredientsSearch?strings(args.get("ingredients"),true):Collections.emptyList();int limit=args.containsKey("top_k")?integer(args.get("top_k"),1,30):10;
        List<Dish> pool=new ArrayList<>();for(Dish d:orEmpty(candidates.findRawForUser(user,type,keyword,query,Integer.MAX_VALUE))){checkDish(d,user);if(!matches(d,hard,null)||!matches(d,additional,type))continue;if(ingredientsSearch&&!hasAnyIngredient(d,ingredients))continue;pool.add(d);}
        // Deterministic paging; respect current/locked references before canonical category recall.
        Set<Long> current=w.getDraft().getDishes().stream().map(Dish::getId).collect(Collectors.toSet());Set<Long> locked=w.getDraft().getLockedDishIds();
        pool.sort(Comparator.comparingInt((Dish d)->locked.contains(d.getId())?0:current.contains(d.getId())?1:2).thenComparing(d->d.getId()));
        if(type==null)pool=categoryRoundRobin(pool,current,locked);
        String scanVersion=candidateVersion(user,w,query,type,keyword,ingredients,pool);int offset=searchOffset(args.get("cursor"),scanVersion);
        int end=(int)Math.min(pool.size(),(long)offset+limit);if(offset>pool.size())throw new IllegalArgumentException("分页位置无效，请重新查询");
        List<Dish> selected=pool.subList(offset,end);List<Long> selectedIds=selected.stream().map(Dish::getId).collect(Collectors.toList());Map<Long,Dish> enriched=new HashMap<>();for(Dish d:orEmpty(dishes.getDishesByIdsForUser(selectedIds,user))){checkDish(d,user);if(matches(d,hard,null)&&matches(d,additional,type))enriched.put(d.getId(),d);}
        int returnedEnd=offset;
        for(Dish raw:selected){
            Dish d=enriched.get(raw.getId());if(d==null)throw new MealConsumptionService.VersionConflict("候选菜品已变化，请重新查询");
            int unknownStart=out.getUnknownFields().size();Map<String,Object> item=recipeSummary(d,out);
            List<String> omitted=new ArrayList<>(Arrays.asList("ingredients","ingredientFacts","steps","methods"));
            item.put("omittedFields",omitted);out.getItems().add(item);searchPage(out,returnedEnd+1,pool.size(),scanVersion);
            // A single valid but escape-heavy summary must still make progress. Omit whole optional
            // fields explicitly; never slice a fact value or present an omitted field as known empty.
            if(out.getItems().size()==1&&encodedLength(out)>SEARCH_RESULT_CHAR_LIMIT){
                for(String field:Arrays.asList("tagCodes","name","contentVersion","datasetVersion","cuisineCode")){
                    item.remove(field);omitted.add(field);
                    if(encodedLength(out)<=SEARCH_RESULT_CHAR_LIMIT)break;
                }
            }
            if(encodedLength(out)>SEARCH_RESULT_CHAR_LIMIT){
                out.getItems().remove(out.getItems().size()-1);
                out.getUnknownFields().subList(unknownStart,out.getUnknownFields().size()).clear();
                if(returnedEnd==offset)throw new IllegalArgumentException("菜品摘要格式无效，请查询其他菜品");
                break;
            }
            returnedEnd++;scope.getAuthorizedDishIds().add(d.getId());
        }
        searchPage(out,returnedEnd,pool.size(),scanVersion);
    }
    private void searchPage(ReadResult out,int end,int total,String version){out.setTruncated(end<total);out.setNextCursor(out.isTruncated()?"c2."+end+"."+version:null);out.setSourceVersion(version);}
    private int searchOffset(Object raw,String version){
        if(raw==null)return 0;String value=text(raw,100);
        if(!value.startsWith("c2."))return offset(raw); // Legacy compatibility remains owner-filtered.
        String[] pieces=value.split("\\.");
        if(pieces.length!=3||!pieces[1].matches("0|[1-9][0-9]{0,9}")||!pieces[2].equals(version))throw new MealConsumptionService.VersionConflict("候选目录或条件已变化，请重新查询");
        return offset(pieces[1]);
    }
    private String candidateVersion(Long user,MealWorkspace w,RecommendationCriteria criteria,String type,String keyword,List<String> ingredients,List<Dish> pool){
        try{
            java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");
            digest.update(fingerprint(map("reader",user,"workspace",w.getId(),"revision",w.getRevision(),"planVersion",w.getDraft().getPlanVersion(),"criteria",criteria,"type",type,"query",keyword,"ingredients",ingredients)).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            // A ranking-fact snapshot, deliberately not a recipe content-version claim.
            // Update incrementally instead of building one full-catalog JSON string.
            for(Dish dish:pool)digest.update((dish.getId()+":"+dish.getContentVersion()+";").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex=new StringBuilder();for(byte b:digest.digest()){hex.append("0123456789abcdef".charAt((b&255)>>>4));hex.append("0123456789abcdef".charAt(b&15));}return hex.toString();
        }catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException("目录版本无法读取",impossible);}
    }
    private int encodedLength(Object value){try{return json.writeValueAsString(value).length();}catch(Exception ex){throw new IllegalStateException("查询结果无法读取",ex);}}
    private List<Dish> categoryRoundRobin(List<Dish> pool,Set<Long> current,Set<Long> locked){List<Dish> out=new ArrayList<>();Map<String,Deque<Dish>> groups=new LinkedHashMap<>();for(String type:TYPES)groups.put(type,new ArrayDeque<>());for(Dish d:pool){if(current.contains(d.getId())||locked.contains(d.getId()))out.add(d);else groups.computeIfAbsent(d.getType(),k->new ArrayDeque<>()).add(d);}boolean added;do{added=false;for(Deque<Dish> group:groups.values())if(!group.isEmpty()){out.add(group.removeFirst());added=true;}}while(added);return out;}
    private RecommendationCriteria merge(RecommendationCriteria hard,RecommendationCriteria extra){RecommendationCriteria out=new RecommendationCriteria();out.setCuisineCodes(hard.getCuisineCodes().isEmpty()?extra.getCuisineCodes():hard.getCuisineCodes());out.setIncludeTagCodes(union(hard.getIncludeTagCodes(),extra.getIncludeTagCodes()));out.setExcludeTagCodes(union(hard.getExcludeTagCodes(),extra.getExcludeTagCodes()));out.setExcludedIngredients(union(hard.getExcludedIngredients(),extra.getExcludedIngredients()));Integer h=hard.getMaxCookMinutes(),e=extra.getMaxCookMinutes();if(h==null)out.setMaxCookMinutes(e);else if(e==null)out.setMaxCookMinutes(h);else out.setMaxCookMinutes(Math.min(h,e));return out;}
    private static List<String> union(List<String> a,List<String> b){Set<String> out=new LinkedHashSet<>(a);out.addAll(b);return new ArrayList<>(out);}
    private boolean matches(Dish d,RecommendationCriteria c,String type){if(type!=null&&!type.equals(d.getType()))return false;if(!c.getCuisineCodes().isEmpty()&&!c.getCuisineCodes().contains(d.getCuisineCode()))return false;Set<String> tags=new HashSet<>(Arrays.asList((d.getTagCodes()==null?"":d.getTagCodes()).split(",")));if(!c.getIncludeTagCodes().isEmpty()&&Collections.disjoint(tags,c.getIncludeTagCodes()))return false;for(String excluded:c.getExcludeTagCodes())if(tags.contains(excluded))return false;if(c.getMaxCookMinutes()!=null&&(d.getCookMinutes()==null||d.getCookMinutes()>c.getMaxCookMinutes()))return false;String raw=ingredientText(d);for(String excluded:c.getExcludedIngredients())if(raw.contains(excluded.toLowerCase(Locale.ROOT)))return false;return true;}
    private static String ingredientText(Dish d){String raw=String.valueOf(d.getCl())+" "+String.valueOf(d.getIngredientsAmounts());if(d.getQuality()!=null)for(CatalogQuality.Ingredient i:orEmpty(d.getQuality().getIngredients()))raw+=" "+i.getName();return raw.toLowerCase(Locale.ROOT);}
    private static boolean hasAnyIngredient(Dish d,List<String> ingredients){String raw=ingredientText(d);for(String name:ingredients)if(raw.contains(name.toLowerCase(Locale.ROOT)))return true;return false;}
    private Map<String,Object> recipeSummary(Dish d,ReadResult out){Map<String,Object> item=dishSummary(d);CatalogQuality q=d.getQuality();boolean servings=q!=null&&"VERIFIED".equals(q.getReviewStatus())&&"VERIFIED".equals(q.getServingsStatus())&&q.getBasePeople()!=null;item.put("basePeople",servings?q.getBasePeople():null);if(!servings)out.getUnknownFields().add("basePeople:"+d.getId());item.put("datasetVersion",q==null?null:q.getDatasetVersion());item.put("detailLevel","summary");return item;}
    private Map<String,Object> recipe(Dish d,ReadResult out){Map<String,Object> item=recipeSummary(d,out);item.put("detailLevel","full");CatalogQuality q=d.getQuality();boolean reviewed=q!=null&&"VERIFIED".equals(q.getReviewStatus());List<Map<String,Object>> facts=new ArrayList<>();if(q!=null)for(CatalogQuality.Ingredient i:orEmpty(q.getIngredients())){if("REJECTED".equals(i.getIdentityStatus()))continue;boolean known=reviewed&&i.verifiedQuantity();facts.add(map("name",i.getName(),"unit",i.getUnit(),"identityStatus",i.getIdentityStatus(),"quantityValue",known?i.getQuantityValue():null,"quantityStatus",known?"VERIFIED":"UNKNOWN"));}item.put("ingredientFacts",facts);item.put("ingredients",d.getCl());return item;}
    @SuppressWarnings("unchecked") private void calendar(Long user,Map<String,Object> args,ReadResult out,boolean review){
        LocalDate start=date(args.get("startDate")),end=date(args.get("endDate"));if(end.isBefore(start)||ChronoUnit.DAYS.between(start,end)>366)throw new IllegalArgumentException("查询范围应在 367 天以内");LocalDate page=args.containsKey("cursor")?date(args.get("cursor")):start;if(page.isBefore(start)||page.isAfter(end))throw new IllegalArgumentException("分页日期无效");LocalDate through=page.plusDays(6).isAfter(end)?end:page.plusDays(6);
        Map<String,Object> data=meals.overview(user,page.toString(),through.toString());List<RecipeRecord> plans=data.get("plans") instanceof List?(List<RecipeRecord>)data.get("plans"):Collections.emptyList();List<MealConsumption> actual=data.get("consumptions") instanceof List?(List<MealConsumption>)data.get("consumptions"):Collections.emptyList();
        List<MealConsumption> reviewMeals=new ArrayList<>();LocalDate today=LocalDate.now(ZoneId.of("Asia/Shanghai"));for(LocalDate day=page;!day.isAfter(through);day=day.plusDays(1)){String date=day.toString();List<Map<String,Object>> planRows=new ArrayList<>(),actualRows=new ArrayList<>();if(!review)for(RecipeRecord p:plans)if(date.equals(p.calendarDay())&&!Boolean.TRUE.equals(p.getIsDeleted())){if(p.getUserId()!=null&&!Objects.equals(user,p.getUserId()))throw new IllegalArgumentException("日历不可访问");planRows.add(map("id",p.getId(),"mealType",p.getMealType(),"name",p.getRecipeName(),"dishIds",p.getDishIds(),"people",p.getTargetPeople(),"revision",p.getRevision(),"basis","planned_only"));}for(MealConsumption a:actual)if(date.equals(a.getMealDate())&&"eaten".equals(a.getStatus())&&!day.isAfter(today)){if(a.getUserId()!=null&&!Objects.equals(user,a.getUserId()))throw new IllegalArgumentException("用餐记录不可访问");actualRows.add(actual(a,json));reviewMeals.add(a);}Map<String,Object> row=map("date",date,"actual",actualRows);if(!review)row.put("plans",planRows);else row.put("basis","explicit_eaten");out.getItems().add(row);}
        if(review){Map<String,Object> report=new DietReviewCalculator(json).calculate(reviewMeals,Collections.emptyList(),today);if(report!=null){Map<String,Object> overview=new LinkedHashMap<>();for(String key:Arrays.asList("mealCount","recordedDays","uniqueDishCount","entryCount","classifiedCount","unclassifiedCount")){Object value=report.get(key);if(value instanceof Number)overview.put(key,value);}if(!out.getItems().isEmpty())out.getItems().get(0).put("summary",overview);}}
        out.setTruncated(through.isBefore(end));out.setNextCursor(out.isTruncated()?through.plusDays(1).toString():null);out.setSourceVersion(fingerprint(map("items",out.getItems(),"planRevisions",data.get("planRevisions"))));
    }
    private void shopping(Long user,Map<String,Object> args,ReadResult out){String status=args.containsKey("status")?text(args.get("status"),20):"pending";if(!Arrays.asList("pending","checked","all").contains(status))throw new IllegalArgumentException("采购状态无效");ShoppingListResponse list=shopping.getList(user,status);int limit=args.containsKey("limit")?integer(args.get("limit"),1,30):30,offset=offset(args.get("cursor"));List<Map<String,Object>> rows=new ArrayList<>();for(ShoppingDishDTO group:list.getDishes())for(ShoppingPreviewItemDTO i:group.getItems()){
        boolean explicit=i.isUserOverride()&&"USER_OVERRIDE".equals(i.getCalculationStatus());
        boolean calculated="CALCULATED".equals(i.getCalculationStatus())&&"PARSED".equals(i.getParseStatus())&&Boolean.TRUE.equals(i.getServingsVerified());
        boolean known=explicit||calculated;
        rows.add(map("id",i.getId(),"name",i.getDisplayName(),"canonicalName",i.getCanonicalName(),"quantityValue",known?i.getQuantityValue():null,"quantityMin",known?i.getQuantityMin():null,"quantityMax",known?i.getQuantityMax():null,
            "quantityText",i.getQuantityText(),"userOverride",i.isUserOverride(),"quantityProvenance",explicit?"user_override":calculated?"verified_calculation":"unknown",
            "unitCode",i.getUnitCode(),"calculationStatus",i.getCalculationStatus(),"checked",i.isChecked(),"sourceDishId",group.getDishId(),"sourceDishName",group.getDishName(),"sourceDate",group.getSourceDate(),"sourceMealType",group.getSourceMealType()));}
        if(offset>rows.size())throw new IllegalArgumentException("分页位置无效，请重新查询");int end=(int)Math.min(rows.size(),(long)offset+limit);out.setItems(new ArrayList<>(rows.subList(offset,end)));out.setTruncated(end<rows.size());out.setNextCursor(out.isTruncated()?String.valueOf(end):null);out.setSourceVersion(String.valueOf(list.getVersion()));}
    private static void fields(Map<String,Object> args,String... names){Set<String> allowed=new HashSet<>(Arrays.asList(names));for(String field:args.keySet())if(!allowed.contains(field))throw new IllegalArgumentException("查询包含不支持的参数");}
    @SuppressWarnings("unchecked") private static Map<String,Object> object(Object raw){if(raw==null)return Collections.emptyMap();if(!(raw instanceof Map))throw new IllegalArgumentException("筛选参数无效");for(Object key:((Map<?,?>)raw).keySet())if(!(key instanceof String))throw new IllegalArgumentException("筛选参数无效");return (Map<String,Object>)raw;}
    private static String text(Object raw,int max){if(!(raw instanceof String)||((String)raw).trim().isEmpty()||((String)raw).length()>max)throw new IllegalArgumentException("查询文字无效");return ((String)raw).trim();}
    private static int integer(Object raw,int min,int max){if(!(raw instanceof Integer||raw instanceof Long)||((Number)raw).longValue()<min||((Number)raw).longValue()>max)throw new IllegalArgumentException("查询数量无效");return ((Number)raw).intValue();}
    private static int offset(Object raw){if(raw==null)return 0;String value=text(raw,10);if(!value.matches("0|[1-9][0-9]*"))throw new IllegalArgumentException("分页位置无效");try{return Integer.parseInt(value);}catch(Exception ex){throw new IllegalArgumentException("分页位置无效");}}
    private static Long id(Object raw){if(raw instanceof Integer||raw instanceof Long){long value=((Number)raw).longValue();if(value>0)return value;}if(raw instanceof String&&((String)raw).matches("[1-9][0-9]{0,18}"))try{return Long.valueOf((String)raw);}catch(Exception ignored){}throw new IllegalArgumentException("菜品编号无效");}
    private static List<Long> ids(Object raw){if(!(raw instanceof List)||((List<?>)raw).isEmpty()||((List<?>)raw).size()>30)throw new IllegalArgumentException("一次请查询 1 至 30 道菜");List<Long> out=new ArrayList<>();for(Object value:(List<?>)raw)out.add(id(value));return out;}
    private static List<String> strings(Object raw,boolean required){if(raw==null&&!required)return new ArrayList<>();if(!(raw instanceof List)||((List<?>)raw).size()>30||(required&&((List<?>)raw).isEmpty()))throw new IllegalArgumentException("查询列表无效");List<String> out=new ArrayList<>();for(Object value:(List<?>)raw)out.add(text(value,40));return out;}
    private static LocalDate date(Object raw){String value=text(raw,10);LocalDate d=MealConsumptionService.date(value);if(value.length()!=10||!d.toString().equals(value))throw new IllegalArgumentException("日期格式应为 yyyy-MM-dd");return d;}
    private String fingerprint(Object value){try{return com.eatwhat.util.WorkflowRequestHash.sha256(json.writeValueAsString(value));}catch(Exception ex){throw new IllegalStateException("查询结果无法读取",ex);}}
}
