package com.eatwhat.service;
import com.eatwhat.dto.*;
import com.eatwhat.entity.*;
import com.eatwhat.mapper.*;
import com.eatwhat.util.RequestIdValidator;
import com.eatwhat.util.WorkflowRequestHash;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.function.Supplier;

@Service
public class ShoppingMutationService {
    private ShoppingExpenseMapper expenses;
    @org.springframework.beans.factory.annotation.Autowired public void setExpenses(ShoppingExpenseMapper value) { expenses=value; }

    @Transactional public ShoppingListResponse expense(Long userId,ShoppingExpenseRequest request) {
        return execute(userId,request.getRequestId(),"expense",request,()->{
            ShoppingList list=lockedList(userId,request.getExpectedListVersion());
            ShoppingListResponse current=listService.getList(userId,"all");
            boolean found=false;
            for(ShoppingDishDTO d:current.getDishes()) for(ShoppingPreviewItemDTO i:d.getItems()) if(com.eatwhat.util.ShoppingIngredientKey.of(i).equals(request.getIngredientKey()))found=true;
            if(!found)throw new IllegalArgumentException("食材不在当前清单中");
            if(request.isRemove()) expenses.delete(list.getId(),request.getIngredientKey());
            else {
                if(request.getAmount()==null || !request.getAmount().matches("^(0|[1-9][0-9]{0,6})(\\.[0-9]{1,2})?$"))throw new IllegalArgumentException("金额最多两位小数，不能为负数");
                if(request.getChannel()!=null && !Arrays.asList("叮咚","盒马","菜市场","超市","其他","").contains(request.getChannel()))throw new IllegalArgumentException("采购渠道无效");
                ShoppingExpense e=new ShoppingExpense();e.setIngredientKey(request.getIngredientKey());e.setAmount(new java.math.BigDecimal(request.getAmount()).setScale(2));e.setChannel(request.getChannel());expenses.save(list.getId(),e);
            }
            increment(list,userId);return listService.getList(userId,"all");
        });
    }
    private final ShoppingMutationMapper logs;
    private final ShoppingListMapper lists;
    private final ShoppingDishMapper groups;
    private final ShoppingItemMapper items;
    private final ShoppingListService listService;
    private final ObjectMapper json;
    public ShoppingMutationService(ShoppingMutationMapper logs,ShoppingListMapper lists,ShoppingDishMapper groups,ShoppingItemMapper items,ShoppingListService listService,ObjectMapper json) {
        this.logs=logs;
        this.lists=lists;
        this.groups=groups;
        this.items=items;
        this.listService=listService;
        this.json=json;
    }
    private String encode(Object value) {
        try {
            return json.writeValueAsString(value);
        }
        catch(Exception e) {
            throw new IllegalStateException("购物操作序列化失败",e);
        }
    }
    private ShoppingList lockedList(Long userId,Long expected) {
        if(expected==null||expected<0)throw new IllegalArgumentException("缺少有效的清单版本");
        ShoppingList list=lists.findByUserIdForUpdate(userId);
        if(list==null) {
            list=new ShoppingList();
            list.setUserId(userId);
            list.setVersion(0L);
            list.setMetadataVersion(1);
            lists.insert(list);
        }
        if(!expected.equals(list.getVersion()))throw new ShoppingListService.VersionConflictException(list.getVersion());
        return list;
    }
    private ShoppingListResponse execute(Long userId,String requestId,String operation,Object request,Supplier<ShoppingListResponse> action) {
        RequestIdValidator.requireValid(requestId);
        if(logs.lockUser(userId)==null)throw new IllegalArgumentException("用户不存在");
        String hash=WorkflowRequestHash.sha256(operation+"|"+encode(request));
        Map<String,Object> previous=logs.request(userId,requestId);
        if(previous!=null) {
            if(!hash.equals(previous.get("requestHash")))throw new MealConsumptionService.VersionConflict("请求标识已用于不同的购物操作");
            try {
                return json.readValue(String.valueOf(previous.get("responseJson")),ShoppingListResponse.class);
            }
            catch(Exception e) {
                throw new IllegalStateException("购物执行记录无法读取",e);
            }
        }
        ShoppingListResponse result=action.get();
        if (expenses != null && result.getListId()!=null) {
            Set<String> keys=new HashSet<>();
            for(ShoppingDishDTO d:result.getDishes())for(ShoppingPreviewItemDTO i:d.getItems())keys.add(com.eatwhat.util.ShoppingIngredientKey.of(i));
            for(ShoppingExpense e:expenses.find(result.getListId()))if(!keys.contains(e.getIngredientKey()))expenses.delete(result.getListId(),e.getIngredientKey());
        }
        logs.log(userId,requestId,hash,encode(result));
        return result;
    }
    private void increment(ShoppingList list,Long userId) {
        lists.updateVersion(list.getId(),userId,list.getVersion()+1,list.getMetadataVersion()==null?1:list.getMetadataVersion());
    }
    @Transactional
    public ShoppingListResponse manual(Long userId,ShoppingManualRequest request) {
        return execute(userId,request.getRequestId(),"manual",request,()-> {
            if(request.getName()==null||request.getName().trim().isEmpty()||request.getName().trim().length()>255)throw new IllegalArgumentException("食材名称需为 1 至 255 个字符");             if(request.getQuantityText()==null||request.getQuantityText().trim().isEmpty()||request.getQuantityText().length()>255)throw new IllegalArgumentException("请填写有效的数量和单位");             if(request.getNote()!=null&&request.getNote().length()>500)throw new IllegalArgumentException("备注不能超过 500 字符");             ShoppingList list=lockedList(userId,request.getExpectedListVersion());             ShoppingDish group=new ShoppingDish();group.setShoppingListId(list.getId());group.setSelectionKey("manual-"+request.getRequestId());group.setDishName("手动添加");groups.insert(group);             ShoppingItem item=new ShoppingItem();item.setShoppingDishId(group.getId());item.setSourceLineNo(0);item.setCanonicalName("manual-"+request.getRequestId());item.setDisplayName(request.getName().trim());item.setQuantityText(request.getQuantityText().trim());             item.setUnitFamily("unknown");item.setParseStatus("NEEDS_ADJUSTMENT");item.setCalculationStatus("USER_DEFINED");item.setUserOverride(true);item.setChecked(false);item.setSourceQuantityText(request.getNote());             items.insert(item);increment(list,userId);return listService.getList(userId,"all");
        }
        );
    }
    @Transactional
    public ShoppingListResponse check(Long userId,ShoppingCheckRequest request) {
        return execute(userId,request.getRequestId(),"check",request,()-> {
            if(request.getItemIds()==null||request.getItemIds().isEmpty()||request.getItemIds().size()>500||request.getChecked()==null)throw new IllegalArgumentException("请指定有效的购物项目和已购状态");             ShoppingList list=lockedList(userId,request.getExpectedListVersion());List<ShoppingItem> found=new ArrayList<>();             for(Long id:new LinkedHashSet<>(request.getItemIds())) {
                if(id==null||id<=0)throw new IllegalArgumentException("购物项目无效");ShoppingItem item=items.findById(id,list.getId());if(item==null)throw new IllegalArgumentException("购物项目不存在或无权访问");found.add(item);
            }
            for(ShoppingItem item:found) {
                item.setChecked(request.getChecked());items.update(item,list.getId());
            }
            increment(list,userId);return listService.getList(userId,"all");
        }
        );
    }
    @Transactional
    public ShoppingListResponse patch(Long userId,Long itemId,ShoppingItemPatchRequest request) {
        return execute(userId,request.getRequestId(),"patch-"+itemId,request,()-> {
            lockedList(userId,request.getExpectedListVersion());return listService.patchItem(userId,itemId,request);
        }
        );
    }
    @Transactional
    public ShoppingListResponse delete(Long userId,Long itemId,ShoppingItemPatchRequest request) {
        return execute(userId,request.getRequestId(),"delete-"+itemId,request,()-> {
            lockedList(userId,request.getExpectedListVersion());return listService.deleteItem(userId,itemId,request.getExpectedListVersion());
        }
        );
    }
}
