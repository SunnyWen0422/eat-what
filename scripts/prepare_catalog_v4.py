"""Build one runtime v4 document from its reviewed full model and clean projection.
No database/network access. Inputs remain untouched. The output directory must be new.
"""
import argparse,copy,hashlib,json
from decimal import Decimal
from pathlib import Path
from canonical_catalog_import import validate_bundle,require

def load(p):return json.loads(Path(p).read_text('utf-8'))
def norm(v):
    if v is None or isinstance(v,(str,bool)):return v
    if isinstance(v,(float,int)):
        s=format(Decimal(str(v)),'f')
        return s.rstrip('0').rstrip('.') if '.' in s else s
    if isinstance(v,list):return [norm(x) for x in v]
    return {k:norm(x) for k,x in v.items()}
def fingerprint(recipe,definitions,version):
    visited=set()
    def visit(iid):
        if iid in visited:return
        visited.add(iid)
        for x in definitions[iid].get('compositionSource',{}).get('constituents',[]):visit(x['ingredientId'])
    for line in recipe['ingredients']:visit(line['ingredientId'])
    payload={'hashContract':'eatwhat-dependency-decimal-string-v1','nutritionRuleVersion':version,'quantityBasis':'SPECIFIED_PRODUCT_INPUT','calculationPolicy':{'quantityPolicy':'fixed-recipe-v1','decimalPrecision':36,'nutritionOutputPlaces':12,'rounding':'ROUND_HALF_UP','optionalBasis':'DEFAULT_ENABLED','unknownQuantity':'NULL_PARTIAL_SUBTOTAL'},'recipe':{'baseServings':recipe['baseServings'],'servingBasis':recipe.get('servingBasis','declared_servings'),'ingredients':recipe['ingredients']},'ingredientDefinitions':[definitions[iid] for iid in sorted(visited)]}
    return hashlib.sha256(json.dumps(norm(payload),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def prepare(model,consumer,queue,retired):
    require(model.get("catalogContractVersion")==4,"Wrong source model contract")
    require(consumer['consumerContractVersion']==1 and consumer['sourceModelContractVersion']==4,'Wrong projection contract')
    require(model['catalogRevision']==consumer['catalogRevision'] and model['idMapping']==consumer['idMapping'] and model['taxonomy']==consumer['taxonomy'],'Mismatched projections')
    out=copy.deepcopy(model);defs={x['id']:x for x in out['ingredients']};rs={x['id']:x for x in out['recipes']}
    require(set(defs)=={x['id'] for x in consumer['ingredients']} and set(rs)=={x['id'] for x in consumer['recipes']},'Mismatched identities')
    for d in consumer['ingredients']:
        require(all(d[k]==defs[d['id']][k] for k in ('id','unit','group')),'Changed ingredient identity')
        defs[d['id']]['name']=d['name']
    for clean in consumer['recipes']:
        r=rs[clean['id']]
        for key,value in clean.items():
            if key in ('ingredients','steps','name','calculatedNutrition'):continue
            require(r[key]==value,'Changed factual field '+key)
        r['name']=clean['name']
        for field,text in [('ingredients','preparation'),('steps','text')]:
            require([x['id'] for x in r[field]]==[x['id'] for x in clean[field]],'Changed line identities')
            for a,b in zip(r[field],clean[field]):
                require(all(a[k]==v for k,v in b.items() if k!=text),'Changed non-display line field')
                a[text]=b[text]
        require(all(r['calculatedNutrition'][k]==v for k,v in clean['calculatedNutrition'].items()),'Changed nutrition')
    out['sourceCatalogRevision']=model['catalogRevision']
    out['catalogRevision']=model['catalogRevision']+'-fixed1'
    out['quantityPolicy']='fixed-recipe-v1'
    for r in out['recipes']:
        r.pop('scaling',None)
        for line in r['ingredients']:line.pop('scaleRule',None)
        r['calculatedNutrition']['perServing']=None
        r['calculatedNutrition'].pop('perServingUnavailableReason',None)
        r['calculatedNutrition']['dependencySha256']=fingerprint(r,defs,out['nutritionRuleVersion'])
    inactive=copy.deepcopy(retired)
    for row in queue['recipeItems']:
        for m in row['sourceMappings']:
            inactive.append({'oldDishId':m['oldDishId'],'name':row['name'],'reason':row['reason'],'sourceRecipeId':row['recipeId']})
    active={m['oldDishId'] for m in out['idMapping']};excluded={x['oldDishId'] for x in inactive}
    require(len(excluded)==len(inactive) and not active&excluded and len(active|excluded)==6665,'Incomplete source accounting')
    validate_bundle(out)
    return out,inactive
def main():
    p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--consumer',required=True);p.add_argument('--queue',required=True);p.add_argument('--retired',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    dest=Path(a.output);require(not dest.exists(),'Output must be new');bundle,inactive=prepare(load(a.model),load(a.consumer),load(a.queue),load(a.retired));dest.mkdir(parents=True)
    for name,data in [('runtime-catalog.json',bundle),('inactive-source.json',inactive)]:
        (dest/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    receipt={'revision':bundle['catalogRevision'],'counts':validate_bundle(bundle),'inactiveMappings':len(inactive),'sourceRecords':6665,'runtimeSha256':hashlib.sha256((dest/'runtime-catalog.json').read_bytes()).hexdigest()}
    (dest/'prepare-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps(receipt))
if __name__=='__main__':main()
