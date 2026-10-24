"""Owned local import only. No credentials discovery, network defaults or live CLI."""
import hashlib,json,math,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NUTRIENTS={'energyKcal','proteinG','fatG','carbohydrateG','fiberG','sodiumMg'}

def assert_owned_target(host,database):
    if host!='127.0.0.1' or not re.fullmatch(r'eatwhat_catalog_local_[0-9a-f]{8}',database):
        raise ValueError('Only a new explicitly owned loopback catalog database is permitted')

def require(ok,message):
    if not ok:raise ValueError(message)

def validate_bundle(bundle):
    require(bundle.get('catalogContractVersion')==4,'Unsupported contract')
    require(bool(bundle.get('catalogRevision')),'Missing revision')
    require(bundle.get('quantityPolicy')=='fixed-recipe-v1','Fixed recipe quantity policy required')
    foods={i['id']:i for i in bundle['ingredients']};recipes={r['id']:r for r in bundle['recipes']}
    require(len(foods)==len(bundle['ingredients']) and len(recipes)==len(bundle['recipes']),'Duplicate identity')
    codes=bundle['taxonomy']['entries']
    for i in foods.values():
        require(i['unit'] in ('g','ml','piece'),'Invalid ingredient unit')
        for key in ('gramsPerUnit','procurementYield'):
            require(i.get(key) is None or numeric(i[key]) and i[key]>0,'Invalid ingredient conversion')
        require(i.get('procurementYield') is None or i['procurementYield']<=1,'Invalid ingredient yield')
        nutrients=i.get('nutritionPer100g')
        require(nutrients is None or set(nutrients)==NUTRIENTS,'Missing nutrient')
        require(nutrients is None or all(numeric(v) and v>=0 for v in nutrients.values()),'Invalid nutrient')
        for c in i.get('compositionSource',{}).get('constituents',[]):require(c['ingredientId'] in foods,'Missing component')
    for r in recipes.values():
        require(r['id']>0 and bool(r['name']),'Invalid recipe')
        require(r['baseServings'] is None or numeric(r['baseServings']) and 0<r['baseServings']<=50,'Invalid source servings')
        require('scaling' not in r,'Fixed recipe cannot carry an active scaling policy')
        require(r['categoryCode'] in codes and r['servingRole'] in ('dish','condiment'),'Invalid classification')
        require(r['mealCodes'] and all(x in codes for x in r['mealCodes']),'Invalid meal applicability')
        lines={l['id']:l for l in r['ingredients']}
        require(lines and len(lines)==len(r['ingredients']),'Duplicate/empty material lines')
        for l in lines.values():
            require(l['ingredientId'] in foods,'Unresolved ingredient')
            require(l['unit']==foods[l['ingredientId']]['unit'],'Mismatched unit')
            if l.get('quantityKind')=='discretionary':
                require(l['quantity'] is None and l.get('quantityDisplay')=='适量','Invalid discretionary quantity')
            else:require(l.get('quantityKind','exact')=='exact' and numeric(l['quantity']) and l['quantity']>0,'Invalid quantity')
            require(isinstance(l['optional'],bool) and isinstance(l['defaultEnabled'],bool) and (l['optional'] or l['defaultEnabled']),'Invalid enabled flags')
            require('scaleRule' not in l,'Fixed material cannot carry a scaling rule')
        used=set();steps=set()
        for s in r['steps']:
            require(s['id'] not in steps and bool(s['text']),'Duplicate/empty step')
            require(set(s['ingredientLineIds'])<=set(lines),'Unresolved step material')
            require(set(s['dependsOn'])<=steps,'Invalid step dependency')
            require(all(s.get(k) is None or numeric(s[k]) and s[k]>=0 for k in ('activeMinutes','waitMinutes')),'Invalid timing')
            require(set(re.findall(r'\{\{amount:([^{}]+)\}\}',s['text']))<=set(lines),'Unresolved amount token')
            used.update(s['ingredientLineIds']);steps.add(s['id'])
        require(steps,'Empty procedure')
        require(all(v is None or numeric(v) and v>=0 for v in r['timing'].values()),'Invalid total timing')
        if 'OP_QUICK_20' in r.get('operationCodes',[]):require(r['timing'].get('totalMinutes') is not None and r['timing']['totalMinutes']<=20,'Invalid quick tag')
        for field in ('dietaryCodes','allergenCodes','methodCodes','sceneCodes','compositionCodes','operationCodes'):
            values=r.get(field)
            require(values is None and field in ('dietaryCodes','allergenCodes') or isinstance(values,list) and all(x in codes for x in values),'Invalid taxonomy')
        n=r['calculatedNutrition'];require(n.get('completeness') in ('partial','complete'),'Invalid nutrition state')
        require(n.get('perServingUnavailableReason') in (None,'diners_not_specified'),'Source servings do not limit equal-share reference')
        if n['completeness']=='partial':require(n['total'] is None and n['perServing'] is None,'Partial nutrition must remain null')
        else:
            require(isinstance(n['total'],dict) and set(n['total'])==NUTRIENTS and all(numeric(v) and v>=0 for v in n['total'].values()),'Invalid complete nutrition')
            require(n.get('perServing') is None,'Per-person reference must be calculated only for explicit diners')
    ids={m['oldDishId'] for m in bundle['idMapping']}
    require(len(ids)==len(bundle['idMapping']),'Duplicate ID mapping')
    require({m['dishId'] for m in bundle['idMapping']}==set(recipes),'Dangling or unmapped recipe')
    return {'recipes':len(recipes),'ingredients':len(foods),'mapped':len(ids)}

def numeric(value):
    return not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value)

def install(connection,bundle,source_hash,retired):
    """Connection must belong to the new runtime; invalid data fails before DDL.

    System catalog only. Existing private recipes must first be converted with
    their owner, using the same validator. Never silently discard them.
    """
    counts=validate_bundle(bundle)
    with connection.cursor() as identity:
        identity.execute('SELECT DATABASE()')
        selected_database=identity.fetchone()[0]
    assert_owned_target(connection.host,selected_database)
    retired_ids={r['oldDishId'] for r in retired};mapped={m['oldDishId'] for m in bundle['idMapping']}
    require(not retired_ids&mapped and len(retired_ids)==len(retired),'Invalid retirement audit')
    require(len(mapped|retired_ids)==6665,'Source accounting incomplete')
    from run_mysql_integration import statements
    dump=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    with connection.cursor() as c:
        c.execute("SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()")
        tables=dict(c.fetchall())
        if 'catalog_metadata' in tables:
            c.execute('SELECT document FROM catalog_metadata WHERE id=1');row=c.fetchone()
            require(row and json.loads(row[0]).get('importSha256')==source_hash,'Existing canonical release differs; explicit whole-version replacement required')
            return {**counts,'replayed':True}
        if 'food' in tables:
            c.execute('SELECT COUNT(*) FROM food WHERE user_id IS NOT NULL');require(c.fetchone()[0]==0,'Owned recipes require explicit canonical conversion before switch')
            require('food_precanonical_archive' not in tables,'Archive name already exists')
            c.execute('RENAME TABLE food TO food_precanonical_archive')
        # Isolated staging has no serving application. The view is never exposed
        # before all canonical inserts and metadata are committed together.
        for statement in statements((ROOT/'backend/db/canonical_catalog.sql').read_text('utf-8')):c.execute(statement)
        # MySQL retargets old foreign keys when food is renamed. Empty staging
        # relations must instead reference the new authoritative recipe table.
        c.execute("SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='food_precanonical_archive'")
        for table,column,constraint in c.fetchall():
            require((table,column) in {('shopping_dish','dish_id'),('dish_ingredient','dish_id')} and re.fullmatch(r'[A-Za-z0-9_]+',constraint),'Unexpected historical recipe relation')
            c.execute('SELECT COUNT(*) FROM `'+table+'`');require(c.fetchone()[0]==0,'Existing business references require explicit migration')
            c.execute('ALTER TABLE `'+table+'` DROP FOREIGN KEY `'+constraint+'`')
            c.execute('ALTER TABLE `'+table+'` MODIFY `'+column+'` BIGINT '+('NULL' if table=='shopping_dish' else 'NOT NULL'))
            c.execute('ALTER TABLE `'+table+'` ADD CONSTRAINT `'+constraint+'` FOREIGN KEY (`'+column+'`) REFERENCES catalog_recipe(id)')
    try:
        connection.begin()
        with connection.cursor() as c:
            c.executemany('INSERT INTO catalog_ingredient(id,document) VALUES(%s,%s)',[(i['id'],dump(i)) for i in bundle['ingredients']])
            rows=[(r['id'],dump(r)) for r in bundle['recipes']]
            for start in range(0,len(rows),100):c.executemany('INSERT INTO catalog_recipe(id,document) VALUES(%s,%s)',rows[start:start+100])
            c.executemany('INSERT INTO catalog_id_mapping(old_id,dish_id) VALUES(%s,%s)',[(m['oldDishId'],m['dishId']) for m in bundle['idMapping']])
            c.executemany('INSERT INTO catalog_retired_source(old_id,document) VALUES(%s,%s)',[(r['oldDishId'],dump(r)) for r in retired])
            metadata={k:v for k,v in bundle.items() if k not in ('recipes','ingredients','idMapping')};metadata['importSha256']=source_hash
            c.execute('INSERT INTO catalog_metadata(id,document) VALUES(1,%s)',(dump(metadata),))
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    return {**counts,'replayed':False,'revision':bundle['catalogRevision'],'sourceSha256':source_hash}
