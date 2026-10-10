"""Pure read-only task catalog. No DB, global RAG index or provider client imports."""
import copy
def execute_read_tool(context,user_id,name,args):
    if not isinstance(context,dict) or context.get('ownerUserId')!=user_id or isinstance(user_id,bool) or user_id<1:raise ValueError('Authorized task scope is missing or different')
    rows=context.get('catalog')
    if not isinstance(rows,list) or len(rows)>500:raise ValueError('Invalid authorized catalog')
    index={}
    for row in rows:
        if not isinstance(row,dict) or isinstance(row.get('id'),bool) or not isinstance(row.get('id'),int) or row['id']<=0 or row['id'] in index:raise ValueError('Invalid catalog identity')
        index[row['id']]=row
    if name in ['get_dish_details','get_dish_methods']:
        ids=args.get('dish_ids') if name=='get_dish_details' else [args.get('dish_id')]
        if not isinstance(ids,list) or not 1<=len(ids)<=30:raise ValueError('Invalid read ID list')
        if any(isinstance(i,bool) or not isinstance(i,(str,int)) for i in ids):raise ValueError('Invalid read ID')
        try:ids=[int(i) for i in ids]
        except (TypeError,ValueError):raise ValueError('Invalid read ID') from None
        if any(i not in index for i in ids):raise ValueError('Recipe was not authorized in this task')
        return [copy.deepcopy(index[i]) for i in ids]
    if name not in ['search_dishes','search_by_ingredients']:raise ValueError('Only four read tools are available')
    filters=args.get('filters') or {}
    allowed={'type','cuisine_codes','include_tag_codes','exclude_tag_codes','excluded_ingredients','max_cook_minutes'}
    if not isinstance(filters,dict) or set(filters)-allowed:raise ValueError('Unsupported filter; do not silently relax a constraint')
    query=str(args.get('query') or '').strip().lower();ingredients=args.get('ingredients') or []
    if not isinstance(ingredients,list):raise ValueError('Invalid ingredient list')
    selected=[]
    for row in rows:
        text=(str(row.get('name',''))+' '+str(row.get('cl',''))).lower();codes=set(str(row.get('tagCodes') or '').split(','))
        if query and query not in text:continue
        if ingredients and not all(str(v).lower() in text for v in ingredients):continue
        if filters.get('type') and row.get('type')!=filters['type']:continue
        if filters.get('cuisine_codes') and row.get('cuisineCode') not in filters['cuisine_codes']:continue
        if filters.get('include_tag_codes') and not set(filters['include_tag_codes']) & codes:continue
        if set(filters.get('exclude_tag_codes') or [])&codes:continue
        if any(str(v).lower() in text for v in filters.get('excluded_ingredients') or []):continue
        if filters.get('max_cook_minutes') is not None and (row.get('cookMinutes') is None or row['cookMinutes']>int(filters['max_cook_minutes'])):continue
        selected.append(copy.deepcopy(row))
    limit=args.get('top_k',10)
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=30:raise ValueError('Invalid read limit')
    return selected[:limit]
