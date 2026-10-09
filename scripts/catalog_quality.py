"""Versioned public catalog governance. Source rows are evidence, never overwritten."""
from collections import Counter
import copy
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re

RULE_FILE=Path(__file__).with_name('catalog-quality-rules.json')

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def load_rules():return json.loads(RULE_FILE.read_text(encoding='utf-8'))

def positive(value):
    try:number=Decimal(str(value))
    except (InvalidOperation,ValueError):raise ValueError('Invalid quantity') from None
    if not number.is_finite() or number<=0:raise ValueError('Quantity must be finite and positive')
    return number

def validate_review(review,source_hash,names):
    if not isinstance(review,dict) or review.get('sourceHash')!=source_hash:raise ValueError('Review does not match source version')
    if review.get('reviewStatus')!='VERIFIED':raise ValueError('Only explicit verified reviews may change facts')
    for field in ['sourceRef','reviewer','reviewedAt','ingredientEvidence','stepStatus','imageRights']:
        if not review.get(field):raise ValueError('Missing review evidence: '+field)
    from datetime import datetime
    try:datetime.fromisoformat(review['reviewedAt'].replace('Z','+00:00'))
    except (TypeError,ValueError):raise ValueError('Invalid review date') from None
    if review['stepStatus'] not in ['VERIFIED','UNKNOWN'] or review['imageRights'] not in ['VERIFIED','UNKNOWN','REJECTED']:
        raise ValueError('Unsupported independent review status')
    evidence=review['ingredientEvidence']
    if not isinstance(evidence,dict) or set(evidence)!=set(names):raise ValueError('Review must identify every effective ingredient')
    if review.get('basePeople') is not None:positive(review['basePeople'])
    for name,fact in evidence.items():
        if not isinstance(fact,dict) or not fact.get('sourceRef'):raise ValueError('Missing ingredient evidence')
        if fact.get('quantityValue') is not None:
            positive(fact['quantityValue'])
            if not fact.get('unit') or not fact.get('quantityEvidence'):raise ValueError('Quantity lacks evidence or unit')
    return review

def normalize_recipe(row,rules=None,review=None):
    rules=rules or load_rules(); original=copy.deepcopy(row)
    if str(row.get('user_id') or '').strip() or str(row.get('is_custom') or '0') not in ['0','0.0']:
        raise ValueError('Private recipes cannot be published in a public bundle')
    try:identifier=int(str(row['id']))
    except (ValueError,KeyError):raise ValueError('Invalid public recipe ID') from None
    if identifier<=0 or not str(row.get('name') or '').strip():raise ValueError('Missing recipe identity')
    source_hash=digest(original);issues=[];changes=[];facts=[];rejected=[]
    def issue(code,field,message,line=None):
        issues.append({'dishId':identifier,'code':code,'field':field,'line':line,'message':message,'sourceHash':source_hash})
    def change(field,old,new,reason):
        changes.append({'dishId':identifier,'field':field,'oldValue':old,'newValue':new,'reason':reason,'sourceHash':source_hash})
    raw=str(row.get('ingredients_amounts') or '').strip()
    if not raw:raise ValueError('Missing structured ingredient evidence')
    steps=str(row.get('steps') or row.get('step') or '')
    for index,chunk in enumerate(re.split('###|#',raw)):
        parts=[v.strip() for v in chunk.split('|')]
        if len(parts)!=7 or any(not v for v in parts):raise ValueError('Malformed seven-part ingredient')
        name,amount,unit,role,preparation,servings,source=parts
        positive(amount)
        if unit not in rules['allowedUnits']:raise ValueError('Unsupported material unit')
        if name in rules['rejectedDescriptorNames']:
            issue('DESCRIPTOR_AS_INGREDIENT','ingredientsAmounts','菜名描述不能作为采购材料',index)
            rejected.append({'line':index,'name':name,'rawText':chunk,'status':'REJECTED','reason':'DESCRIPTOR_AS_INGREDIENT'})
            change('ingredientName',name,None,'DESCRIPTOR_AS_INGREDIENT');continue
        observed=name in steps
        facts.append({'line':index,'name':name,'rawText':chunk,'rawQuantity':amount,'rawUnit':unit,
                      'sourceLabel':source,'preparation':preparation,'role':role,
                      'identityStatus':'SOURCE_EXPLICIT' if observed else 'UNREVIEWED',
                      'identityEvidence':name if observed else None,
                      'quantityValue':None,'unit':unit,'quantityStatus':'UNKNOWN',
                      'quantityEvidence':None,'displayQuantity':'用量待核实'})
        if not observed:issue('INGREDIENT_IDENTITY_UNREVIEWED','ingredientsAmounts','材料名称未在当前做法中直接匹配，需核验别名或来源',index)
    if not facts:raise ValueError('Recipe has no effective ingredients after descriptor rejection')
    names=[f['name'] for f in facts]
    for group in rules['possibleAliasGroups']:
        if len(set(group)&set(names))>1:issue('POSSIBLE_ALIAS_DUPLICATE','ingredientsAmounts','可能存在同义材料，必须结合来源核对')
    issue('QUANTITY_EVIDENCE_MISSING','ingredientsAmounts','原用量由统一规则加工，不能视作原配方证据')
    issue('SERVINGS_EVIDENCE_MISSING','fl','原份量未独立核验，不能按统一标签计算')
    quality={'dishId':identifier,'sourceHash':source_hash,'datasetVersion':rules['version'],'reviewStatus':'UNREVIEWED',
             'sourceKind':'LEGACY_GENERATED','sourceRef':None,'basePeople':None,'servingsStatus':'UNKNOWN',
             'ingredients':facts,'rejectedIngredients':rejected,'stepStatus':'UNREVIEWED',
             'nutritionKcal':None,'nutritionStatus':'UNKNOWN','imageRightsStatus':'UNKNOWN',
             'timeStatus':'ESTIMATED','canScale':False,'reviewedBy':None,'reviewedAt':None,'cookedAt':None}
    if not str(row.get('image') or '').strip():issue('IMAGE_MISSING','image','没有图片，页面使用文字占位')
    else:issue('IMAGE_RIGHTS_UNREVIEWED','image','图片来源与使用权限需要独立核验')
    if str(row.get('kcal') or '').strip() in ['0','0.0']:change('kcal',row.get('kcal'),None,'IMPORTED_ZERO_IS_UNKNOWN')
    if review is not None:
        if review.get('dishId')!=identifier:raise ValueError('Review targets another recipe')
        validate_review(review,source_hash,names)
        quality.update(reviewStatus='VERIFIED',sourceKind='REVIEWED_SOURCE',sourceRef=review['sourceRef'],
                       basePeople=str(positive(review['basePeople'])) if review.get('basePeople') is not None else None,
                       servingsStatus='VERIFIED' if review.get('basePeople') is not None else 'UNKNOWN',
                       stepStatus=review['stepStatus'],imageRightsStatus=review['imageRights'],reviewedBy=review['reviewer'],
                       reviewedAt=review['reviewedAt'],cookedAt=review.get('cookedAt'))
        for fact in facts:
            evidence=review['ingredientEvidence'][fact['name']]
            fact['identityStatus']='VERIFIED';fact['identityEvidence']=evidence['sourceRef']
            if evidence.get('quantityValue') is not None:
                if evidence['unit'] not in rules['allowedUnits']:raise ValueError('Unreviewed unit conversion')
                fact.update(quantityValue=str(positive(evidence['quantityValue'])),unit=evidence['unit'],quantityStatus='VERIFIED',
                            quantityEvidence=evidence['quantityEvidence'],displayQuantity=str(positive(evidence['quantityValue']))+evidence['unit'])
        quality['canScale']=quality['basePeople'] is not None and all(f['quantityStatus']=='VERIFIED' for f in facts)
    quality['issueCodes']=sorted(set(x['code'] for x in issues))
    quality['contentHash']=digest(quality)
    cleaned=copy.deepcopy(row)
    cleaned['cl']='#'.join(names)
    cleaned['ingredients_amounts']='###'.join('|'.join([f['name'],f['quantityValue'] or '适量',f['unit'],f['role'],f['preparation'],
                                                  (quality['basePeople']+'人') if quality['basePeople'] else '原份数待核实',
                                                  '已核验' if f['quantityStatus']=='VERIFIED' else '用量待核实']) for f in facts)
    cleaned['fl']=(quality['basePeople']+'人') if quality['basePeople'] else ''
    cleaned['kcal']='' if quality['nutritionKcal'] is None else str(quality['nutritionKcal'])
    for key in ['cl','ingredients_amounts','fl']:
        if cleaned.get(key)!=row.get(key):change(key,row.get(key),cleaned.get(key),'EVIDENCE_AWARE_NORMALIZATION')
    return {'recipe':cleaned,'original':original,'quality':quality,'issues':issues,'changes':changes}

def profile_catalog(rows):
    rows=list(rows);ids=[str(r.get('id')) for r in rows];counts=Counter(ids)
    duplicate_ids=sum(n-1 for n in counts.values() if n>1)
    if duplicate_ids:raise ValueError('Duplicate public recipe IDs')
    fields=sorted(set().union(*(r.keys() for r in rows))) if rows else []
    quantities=Counter();units=Counter();materials=0
    for row in rows:
        for line in re.split('###|#',str(row.get('ingredients_amounts') or '')):
            values=line.split('|')
            if len(values)==7:quantities[values[1]]+=1;units[values[2]]+=1;materials+=1
    names=Counter(str(r.get('name')) for r in rows)
    return {'rows':len(rows),'fields':fields,'missing':{f:sum(r.get(f) is None or not str(r.get(f)).strip() for r in rows) for f in fields},
            'duplicateIds':duplicate_ids,'duplicateFullRows':len(rows)-len({digest(r) for r in rows}),
            'sameNameGroups':sum(n>1 for n in names.values()),'categories':dict(Counter(r.get('type') for r in rows)),
            'ingredientCount':materials,'quantityDistribution':dict(quantities),'unitDistribution':dict(units)}

def build_bundle(source_csv,out_dir,review_file=None):
    source=Path(source_csv);out=Path(out_dir)
    if out.exists():raise FileExistsError('Use a fresh output directory; original versions must be retained')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    with source.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    profile=profile_catalog(rows);reviews={}
    if review_file:
        for line in Path(review_file).read_text(encoding='utf-8').splitlines():
            if not line.strip():continue
            value=json.loads(line);key=value.get('dishId')
            if key in reviews:raise ValueError('Duplicate review ID')
            reviews[key]=value
        if set(reviews)-{int(r['id']) for r in rows}:raise ValueError('Review is outside source catalog')
    results=[normalize_recipe(row,review=reviews.get(int(row['id']))) for row in rows]
    dataset_version=load_rules()['version']+'-'+digest({'source':before,'rules':load_rules(),'reviews':reviews})[:16]
    for result in results:
        result['quality']['datasetVersion']=dataset_version
        result['quality'].pop('contentHash',None);result['quality']['contentHash']=digest(result['quality'])
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise RuntimeError('Source changed while being read')
    out.mkdir(parents=True)
    def jsonl(name,values):
        with (out/name).open('w',encoding='utf-8',newline='\n') as f:
            for value in values:f.write(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
    with (out/'recipes.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]) if rows else []);writer.writeheader();writer.writerows(r['recipe'] for r in results)
    jsonl('quality.jsonl',(r['quality'] for r in results))
    jsonl('changes.jsonl',(x for r in results for x in r['changes']))
    # Source recipes are public; retaining originals supports review and reversal.
    jsonl('source-recipes.jsonl',(r['original'] for r in results))
    issue_rows=[x for r in results for x in r['issues']]
    with (out/'issues.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['dishId','code','field','line','message','sourceHash']);writer.writeheader();writer.writerows(issue_rows)
    candidates=[];groups={}
    # Round-robin categories, then favor fewer unresolved identities. This is a review queue, not an endorsement.
    for result in sorted(results,key=lambda r:(sum(x['code']=='INGREDIENT_IDENTITY_UNREVIEWED' for x in r['issues']),len(r['issues']),int(r['recipe']['id']))):
        groups.setdefault(result['recipe'].get('type'),[]).append(result)
    while len(candidates)<load_rules()['reviewCandidateLimit'] and any(groups.values()):
        for group in sorted(groups):
            if groups[group] and len(candidates)<load_rules()['reviewCandidateLimit']:candidates.append(groups[group].pop(0))
    with (out/'review-candidates.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['dishId','name','type','sourceHash','reviewStatus','issueCodes']);writer.writeheader()
        writer.writerows({'dishId':r['quality']['dishId'],'name':r['recipe']['name'],'type':r['recipe'].get('type'),
                         'sourceHash':r['quality']['sourceHash'],'reviewStatus':r['quality']['reviewStatus'],
                         'issueCodes':','.join(r['quality']['issueCodes'])} for r in candidates)
    (out/'profile.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2),encoding='utf-8')
    manifest={'formatVersion':1,'rulesVersion':load_rules()['version'],'datasetVersion':dataset_version,'sourceSha256':before,'recipeCount':len(results),
              'ingredientCountBefore':profile['ingredientCount'],'ingredientCountAfter':sum(len(r['quality']['ingredients']) for r in results),
              'rejectedDescriptorCount':sum(len(r['quality']['rejectedIngredients']) for r in results),
              'verifiedRecipeCount':sum(r['quality']['reviewStatus']=='VERIFIED' for r in results),
              'scalableRecipeCount':sum(r['quality']['canScale'] for r in results),'candidateCount':len(candidates),
              'issueDistribution':dict(Counter(x['code'] for x in issue_rows)),
              'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file()}}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'audit.md').write_text('# 菜谱治理版本审计\n\n'
        f"共 {len(results):,} 道公开菜，ID 保留；原始 CSV 校验值 {before}。\n\n"
        f"排除描述词材料 {manifest['rejectedDescriptorCount']} 条；有效材料 {manifest['ingredientCountAfter']:,} 条。"
        f"已核验菜谱 {manifest['verifiedRecipeCount']} 道，可整体缩放 {manifest['scalableRecipeCount']} 道；复核候选 {len(candidates)} 道。\n\n"
        '所有无依据加工用量、统一份量和导入零热量保持未知，原值保存在 source-recipes.jsonl 与 quality.jsonl。'
        '同义材料仅提示核对，没有自动合并。候选不是可信主推或实做通过。\n\n'
        '缺失、重复、类别、数量和单位分布见 profile.json；逐ID问题见 issues.csv；修订见 changes.jsonl。'
        '原表未修改，本版本未写入线上。\n',encoding='utf-8')
    return manifest
