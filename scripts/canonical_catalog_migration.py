"""Data-preserving catalog cutover library. The caller owns backup and maintenance.

No connection discovery or command-line production target. Rehearse these exact
functions on a restored database before activating a live catalog.
"""
import hashlib
import json
from pathlib import Path
import re
from decimal import Decimal,ROUND_HALF_UP,localcontext
from canonical_catalog_import import validate_bundle, require
from run_mysql_integration import statements

ROOT = Path(__file__).resolve().parents[1]
TABLES = ('catalog_recipe','catalog_ingredient','catalog_metadata','catalog_id_mapping','catalog_retired_source')
ARCHIVE = 'food_precanonical_archive'

def same_document(expected,actual):
    """Compare native JSON numbers at the published 12-place output precision.

    MySQL's native JSON double printer may change one final IEEE digit. Identity,
    booleans, nulls, text, key sets and ordered arrays remain strict.
    """
    if isinstance(expected,bool) or isinstance(actual,bool):return type(expected) is type(actual) and expected==actual
    if isinstance(expected,dict) and isinstance(actual,dict):
        return expected.keys()==actual.keys() and all(same_document(value,actual[key]) for key,value in expected.items())
    if isinstance(expected,list) and isinstance(actual,list):
        return len(expected)==len(actual) and all(same_document(a,b) for a,b in zip(expected,actual))
    if isinstance(expected,(int,float)) and isinstance(actual,(int,float)):
        if isinstance(expected,int) and isinstance(actual,int):return expected==actual
        with localcontext() as context:
            context.prec=80;a,b=Decimal(str(expected)),Decimal(str(actual))
            return a.is_finite() and b.is_finite() and a.quantize(Decimal('0.000000000001'),rounding=ROUND_HALF_UP)==b.quantize(Decimal('0.000000000001'),rounding=ROUND_HALF_UP)
    return type(expected) is type(actual) and expected==actual

def encode(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False,default=str)

def private_document(row,standards=()):
    """Preserve simple user-entered recipes, never invent amounts or procedure.

    Unsupported source shapes stop the release for an explicit converter. This
    intentionally does not try to repair an incomplete personal recipe.
    """
    value={k.lower():v for k,v in row.items()}
    require(value.get('user_id') is not None,'Private owner required')
    source=(value.get('ingredients_amounts') or value.get('cl') or '').strip()
    require(source and not re.search(r'[0-9０-９|:：{}\[\]]',source),'Personal quantity format needs explicit conversion')
    names=[s.strip() for s in re.split(r'[\s、,，;；#]+',source) if s.strip()]
    require(0<len(names)<=100,'Unsupported personal materials')
    original_steps=value.get('steps') or value.get('step') or ''
    texts=[s.strip() for s in re.split(r'###|#|\r?\n',original_steps) if s.strip()]
    require(texts and value.get('name'),'Personal name and original text required')
    category={'meat':'CAT_MEAT','veg':'CAT_VEGETABLE','soup':'CAT_SOUP','staple':'CAT_STAPLE','dessert':'CAT_DESSERT'}.get(value.get('type'))
    require(category is not None,'Unknown personal category')
    definitions=[];lines=[]
    for index,name in enumerate(names,1):
        matches=[d for d in standards if name in [d['name']]+d.get('aliases',[])]
        require(len(matches)<=1,'Ambiguous ingredient identity needs explicit conversion')
        iid=matches[0]['id'] if matches else 'ingredient-name-'+hashlib.sha256(name.encode()).hexdigest()[:24]
        if not matches:definitions.append({'id':iid,'name':name,'aliases':[],'group':'unknown','unit':'g',
            'gramsPerUnit':None,'procurementYield':None,'definitionKnowledge':'identity_only',
            'animal':None,'animalOrigins':None,'allergens':None,'nutritionPer100g':None})
        unit=matches[0]['unit'] if matches else 'g'
        lines.append({'id':'i'+str(index),'ingredientId':iid,'quantity':None,'quantityKind':'discretionary',
            'quantityDisplay':'适量','unit':unit,'role':'main','optional':False,'defaultEnabled':True,'preparation':''})
    steps=[{'id':'s'+str(i),'text':text,'ingredientLineIds':[],'dependsOn':[],
            'activeMinutes':None,'waitMinutes':None} for i,text in enumerate(texts,1)]
    recipe={'id':value['id'],'name':value['name'],'baseServings':None,'servingBasis':'recipe_batch',
        'quantityPolicy':'fixed-recipe-v1','categoryCode':category,'mealCodes':['MEAL_LUNCH','MEAL_DINNER'],
        'cuisineCode':None,'flavor':{'baseCodes':[],'specialCodes':[],'spiceLevel':None,'intensityCode':None},
        'methodCodes':[],'primaryMethodCode':None,'requiredEquipmentCodes':[],'sceneCodes':[],
        'operationCodes':[],'dietaryCodes':None,'allergenCodes':None,'compositionCodes':[],
        'ingredients':lines,'steps':steps,'timing':{'activeMinutes':None,'waitMinutes':None,'totalMinutes':None},
        'imageUrl':value.get('image'),'dishGroupId':'personal-'+str(value['id']),'servingRole':'dish',
        'calculatedNutrition':{'completeness':'partial','total':None,'perServing':None},
        'provenance':{'sourceKind':'preserved-personal-recipe','sourceContentSha256':hashlib.sha256(encode(value).encode()).hexdigest()}}
    return recipe,definitions

def logical_inventory(connection,exclude=()):
    """Stable logical checksums, including raw historical snapshots, no row output."""
    result={}
    with connection.cursor() as c:
        c.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
        names=[r[0] for r in c.fetchall() if r[0] not in exclude]
        for name in names:
            require(re.fullmatch(r'[A-Za-z0-9_]+',name),'Unsafe table name')
            c.execute('SELECT * FROM `'+name+'`')
            # Sort row digests rather than source rows; order and storage types do not change facts.
            digests=sorted(hashlib.sha256(encode(list(row)).encode()).hexdigest() for row in c.fetchall())
            result[name]={'rows':len(digests),'sha256':hashlib.sha256('\n'.join(digests).encode()).hexdigest()}
    return result

def stage(connection,bundle,source_hash,retired):
    counts=validate_bundle(bundle)
    retired_ids={r['oldDishId'] for r in retired};mapped_ids={x['oldDishId'] for x in bundle['idMapping']}
    require(len(retired_ids)==len(retired) and not retired_ids&mapped_ids and len(retired_ids|mapped_ids)==6665,'Source accounting mismatch')
    with connection.cursor() as c:
        c.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')
        existing={r[0] for r in c.fetchall()}
        require('food' in existing and not (set(TABLES)|{ARCHIVE})&existing,'Catalog already staged or activated')
        c.execute('SELECT * FROM food WHERE user_id IS NOT NULL ORDER BY ID')
        keys=[x[0] for x in c.description];personal=[dict(zip(keys,row)) for row in c.fetchall()]
        private=[(row,*private_document(row,bundle['ingredients'])) for row in personal]
        active={r['id'] for r in bundle['recipes']}|{r['id'] for _,r,_ in private}
        require(len(active)==len(bundle['recipes'])+len(private),'Private/system ID collision')
        # Current deployment preserves every existing business ID without rewriting history.
        mapping={x['oldDishId']:x['dishId'] for x in bundle['idMapping']}
        retired_ids={r['oldDishId'] for r in retired}
        for table,column in [('favorite_dishes','DISH_ID'),('shopping_dish','dish_id')]:
            c.execute('SELECT DISTINCT `'+column+'` FROM `'+table+'` WHERE `'+column+'` IS NOT NULL')
            ids={r[0] for r in c.fetchall()}
            require(not any(i in mapping and mapping[i]!=i for i in ids),'Referenced aliases require explicit reference conversion')
            require(ids<=active|retired_ids,'Unresolved business reference')
            if table=='shopping_dish':require(ids<=active,'Retired shopping sources require explicit relation conversion')
        ddl=list(statements((ROOT/'backend/db/canonical_catalog.sql').read_text('utf-8')))
        for statement in ddl:
            if statement.upper().startswith('CREATE TABLE'):c.execute(statement)
        c.executemany('INSERT INTO catalog_ingredient(id,document) VALUES(%s,%s)',[(x['id'],encode(x)) for x in bundle['ingredients']])
        definitions={d['id']:d for _,_,ds in private for d in ds}
        if definitions:c.executemany('INSERT INTO catalog_ingredient(id,document) VALUES(%s,%s)',[(i,encode(d)) for i,d in definitions.items()])
        recipes=bundle['recipes']
        for start in range(0,len(recipes),50):
            c.executemany('INSERT INTO catalog_recipe(id,document) VALUES(%s,%s)',[(r['id'],encode(r)) for r in recipes[start:start+50]])
        for row,recipe,_ in private:
            source={k.lower():v for k,v in row.items()}
            c.execute('INSERT INTO catalog_recipe(id,owner_id,is_published,created_at,document) VALUES(%s,%s,%s,%s,%s)',
                      (recipe['id'],source['user_id'],source.get('is_published',1),source['create_time'],encode(recipe)))
        c.executemany('INSERT INTO catalog_id_mapping(old_id,dish_id) VALUES(%s,%s)',[(m['oldDishId'],m['dishId']) for m in bundle['idMapping']])
        c.executemany('INSERT INTO catalog_retired_source(old_id,document) VALUES(%s,%s)',[(r['oldDishId'],encode(r)) for r in retired])
        metadata={k:v for k,v in bundle.items() if k not in ('recipes','ingredients','idMapping')}
        metadata.update(importSha256=source_hash,privateRecipesPreserved=len(private))
        c.execute('INSERT INTO catalog_metadata(id,document) VALUES(1,%s)',(encode(metadata),))
    connection.commit()
    return {**counts,'privateRecipes':len(private),'privateIngredients':len(definitions)}

def relation_sql(relation,target):
    table,column,constraint,kind,nullable,delete_rule,update_rule=relation
    require((table,column) in {('shopping_dish','dish_id'),('dish_ingredient','dish_id')},'Unexpected catalog relation')
    require(re.fullmatch(r'[A-Za-z0-9_]+',constraint) and re.fullmatch(r'(?:int|bigint)(?:\(\d+\))?(?: unsigned)?',kind),'Unsupported relation shape')
    require(delete_rule in ('CASCADE','RESTRICT','NO ACTION','SET NULL') and update_rule in ('CASCADE','RESTRICT','NO ACTION','SET NULL'),'Unsupported relation rule')
    return 'ALTER TABLE `'+table+'` ADD CONSTRAINT `'+constraint+'` FOREIGN KEY (`'+column+'`) REFERENCES '+target+'(id) ON DELETE '+delete_rule+' ON UPDATE '+update_rule

def activate(connection,after_ddl=None):
    """Caller must have verified the current frozen backup and rehearsal first."""
    with connection.cursor() as c:
        c.execute('SELECT COUNT(*) FROM catalog_metadata WHERE id=1');require(c.fetchone()[0]==1,'Catalog not fully staged')
        c.execute("SELECT k.TABLE_NAME,k.COLUMN_NAME,k.CONSTRAINT_NAME,col.COLUMN_TYPE,col.IS_NULLABLE,r.DELETE_RULE,r.UPDATE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.COLUMNS col ON BINARY col.TABLE_SCHEMA=BINARY k.TABLE_SCHEMA AND BINARY col.TABLE_NAME=BINARY k.TABLE_NAME AND BINARY col.COLUMN_NAME=BINARY k.COLUMN_NAME JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON BINARY r.CONSTRAINT_SCHEMA=BINARY k.CONSTRAINT_SCHEMA AND BINARY r.TABLE_NAME=BINARY k.TABLE_NAME AND BINARY r.CONSTRAINT_NAME=BINARY k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='food'")
        relations=c.fetchall()
        for relation in relations:relation_sql(relation,'food')
        c.execute('SELECT document FROM catalog_metadata WHERE id=1');meta=json.loads(c.fetchone()[0]);meta['activationRelations']=relations
        c.execute('UPDATE catalog_metadata SET document=%s WHERE id=1',(encode(meta),));connection.commit()
        def ddl(sql):
            c.execute(sql)
            if after_ddl:after_ddl(sql)
        ddl('RENAME TABLE food TO '+ARCHIVE)
        # Renaming retargets FKs to the archive; relink only verified recipe relations.
        for relation in relations:
            table,column,constraint,kind,nullable,delete_rule,update_rule=relation
            c.execute('SELECT COUNT(*) FROM `'+table+'` x LEFT JOIN catalog_recipe r ON r.id=x.`'+column+'` WHERE x.`'+column+'` IS NOT NULL AND r.id IS NULL')
            require(c.fetchone()[0]==0,'Unresolved recipe foreign key')
            ddl('ALTER TABLE `'+table+'` DROP FOREIGN KEY `'+constraint+'`')
            ddl('ALTER TABLE `'+table+'` MODIFY `'+column+'` BIGINT '+('NULL' if nullable=='YES' else 'NOT NULL'))
            ddl(relation_sql(relation,'catalog_recipe'))
        for statement in statements((ROOT/'backend/db/canonical_catalog.sql').read_text('utf-8')):
            if statement.upper().startswith('CREATE VIEW'):ddl(statement)
    connection.commit()

def rollback_view(connection,after_ddl=None):
    """Maintenance-only rollback, before traffic opens. Never restore the whole DB.

    After traffic opens the caller must preserve and reconcile new catalog writes
    first; this function cannot make old services understand such new writes.
    """
    with connection.cursor() as c:
        def ddl(sql):
            c.execute(sql)
            if after_ddl:after_ddl(sql)
        c.execute('SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')
        tables=dict(c.fetchall())
        if ARCHIVE not in tables and 'catalog_metadata' not in tables:return
        c.execute('SELECT document FROM catalog_metadata WHERE id=1');row=c.fetchone()
        if not row:
            require(ARCHIVE not in tables and tables.get('food')=='BASE TABLE','Missing activation journal');return
        relations=json.loads(row[0]).get('activationRelations')
        if ARCHIVE not in tables and relations is None:
            require(tables.get('food')=='BASE TABLE','Unexpected pre-activation state');return
        require(isinstance(relations,list),'Original relation journal is missing')
        if ARCHIVE in tables:
            if tables.get('food')=='VIEW':ddl('DROP VIEW food')
            require('food' not in tables or tables.get('food')=='VIEW','Unexpected food table during rollback')
        else:require(tables.get('food')=='BASE TABLE','Original food table unavailable')
        for relation in relations:
            table,column,constraint,kind,nullable,_,_=relation;relation_sql(relation,'food')
            c.execute('SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=%s AND CONSTRAINT_NAME=%s',(table,constraint))
            if c.fetchone()[0]:ddl('ALTER TABLE `'+table+'` DROP FOREIGN KEY `'+constraint+'`')
        if ARCHIVE in tables:ddl('RENAME TABLE '+ARCHIVE+' TO food')
        for relation in relations:
            table,column,constraint,kind,nullable,_,_=relation
            ddl('ALTER TABLE `'+table+'` MODIFY `'+column+'` '+kind+' '+('NULL' if nullable=='YES' else 'NOT NULL'))
            ddl(relation_sql(relation,'food'))
    connection.commit()
