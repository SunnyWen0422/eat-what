"""Prepare/apply a nutrition-only catalog update; never replace recipes or user tables.

Call prepare(old_bundle, candidate) offline. apply_patch(connection, patch, execute)
requires an explicitly selected connection and is also used in restore rehearsals.
No credentials, network discovery, DDL or user-data deletion lives in this module.
"""
import copy
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP


def normalized(value):
    # MySQL JSON double round trips differ below this precision. This is solely
    # for comparisons, never rounding stored recipe quantities or nutrition.
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float, Decimal)):
        return {'$number': str(Decimal(str(value)).quantize(Decimal('0.0000000001'), rounding=ROUND_HALF_UP).normalize())}
    if isinstance(value, (list, tuple)):
        return [normalized(v) for v in value]
    return {k: normalized(v) for k, v in value.items()}


def fingerprint(value):
    return hashlib.sha256(json.dumps(normalized(value), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def facts(recipe):
    return {k: v for k, v in recipe.items() if k != 'calculatedNutrition'}


def prepare(before, after):
    assert before['quantityPolicy'] == after['quantityPolicy'] == 'fixed-recipe-v1'
    assert before['catalogContractVersion'] == after['catalogContractVersion'] == 4
    assert fingerprint(before['idMapping']) == fingerprint(after['idMapping'])
    changed_top = {k for k in before.keys() | after.keys() if fingerprint(before.get(k)) != fingerprint(after.get(k))}
    assert changed_top <= {'recipes', 'ingredients', 'catalogRevision', 'nutritionRuleVersion', 'sourceCatalogRevision', 'sourceAttribution'}
    old_recipes = {r['id']: r for r in before['recipes']}
    new_recipes = {r['id']: r for r in after['recipes']}
    assert len(old_recipes) == len(before['recipes']) == len(new_recipes) == len(after['recipes'])
    assert old_recipes.keys() == new_recipes.keys()
    recipes = []
    for rid, old in old_recipes.items():
        new = new_recipes[rid]
        assert fingerprint(facts(old)) == fingerprint(facts(new)), 'Recipe facts changed: ' + str(rid)
        assert new['calculatedNutrition']['scope'] == 'main_ingredients'
        recipes.append({'id': rid, 'before': fingerprint(old), 'after': fingerprint(new), 'nutrition': new['calculatedNutrition']})
    old_defs = {i['id']: i for i in before['ingredients']}
    new_defs = {i['id']: i for i in after['ingredients']}
    assert len(old_defs) == len(before['ingredients']) == len(new_defs) == len(after['ingredients'])
    assert old_defs.keys() == new_defs.keys()
    ingredients = []
    for iid, old in old_defs.items():
        new = new_defs[iid]
        changed = {k for k in old.keys() | new.keys() if fingerprint(old.get(k)) != fingerprint(new.get(k))}
        assert changed <= {'nutritionPer100g', 'provenance', 'definitionKnowledge', 'compositionSource'}, (iid, changed)
        ingredients.append({'id': iid, 'before': fingerprint(old), 'after': fingerprint(new),
                            'changes': {k: new[k] for k in changed if k in new}, 'remove': [k for k in changed if k not in new]})
    keys = ('catalogRevision', 'nutritionRuleVersion', 'sourceCatalogRevision', 'sourceAttribution')
    return {'version': 1, 'recipes': recipes, 'ingredients': ingredients,
            'metadataBefore': {k: before.get(k) for k in keys}, 'metadataAfter': {k: after.get(k) for k in keys},
            'sourceSha256': fingerprint(before), 'candidateSha256': fingerprint(after)}


def apply_patch(connection, patch, execute=False):
    assert patch['version'] == 1
    # Caller must use a fresh, dedicated connection: do not commit unrelated work.
    connection.begin()
    lock = ' FOR UPDATE' if execute else ''
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT document FROM catalog_metadata WHERE id=1' + lock)
            metadata = json.loads(cursor.fetchone()[0])
            assert all(fingerprint(metadata.get(k)) == fingerprint(v) for k, v in patch['metadataBefore'].items()), 'Catalog revision changed'
            cursor.execute('SELECT id,document FROM catalog_recipe WHERE owner_id IS NULL ORDER BY id' + lock)
            recipes = {r[0]: json.loads(r[1]) for r in cursor.fetchall()}
            assert recipes.keys() == {r['id'] for r in patch['recipes']}, 'Public recipe identity changed'
            cursor.execute('SELECT id,document FROM catalog_ingredient ORDER BY id' + lock)
            ingredients = {r[0]: json.loads(r[1]) for r in cursor.fetchall()}
            rollback = {'recipes': [], 'ingredients': [], 'metadata': metadata}
            updates = {'recipes': [], 'ingredients': []}
            for item in patch['recipes']:
                old = recipes[item['id']]
                assert fingerprint(old) == item['before'], 'Recipe source mismatch: ' + str(item['id'])
                new = copy.deepcopy(old)
                new['calculatedNutrition'] = item['nutrition']
                assert fingerprint(new) == item['after']
                rollback['recipes'].append([item['id'], old['calculatedNutrition']])
                updates['recipes'].append((json.dumps(new, ensure_ascii=False), item['id']))
            for item in patch['ingredients']:
                old = ingredients[item['id']]
                assert fingerprint(old) == item['before'], 'Ingredient source mismatch: ' + item['id']
                if not item['changes'] and not item['remove']:
                    continue
                new = copy.deepcopy(old)
                new.update(item['changes'])
                for key in item['remove']:
                    new.pop(key, None)
                assert fingerprint(new) == item['after']
                rollback['ingredients'].append([item['id'], old])
                updates['ingredients'].append((json.dumps(new, ensure_ascii=False), item['id']))
            if execute:
                cursor.executemany('UPDATE catalog_recipe SET document=%s WHERE id=%s AND owner_id IS NULL', updates['recipes'])
                cursor.executemany('UPDATE catalog_ingredient SET document=%s WHERE id=%s', updates['ingredients'])
                new_metadata = copy.deepcopy(metadata)
                new_metadata.update(patch['metadataAfter'])
                cursor.execute('UPDATE catalog_metadata SET document=%s WHERE id=1', (json.dumps(new_metadata, ensure_ascii=False),))
                cursor.execute('SELECT id,document FROM catalog_recipe WHERE owner_id IS NULL')
                actual = {rid: fingerprint(json.loads(doc)) for rid, doc in cursor.fetchall()}
                assert actual == {r['id']: r['after'] for r in patch['recipes']}
                cursor.execute('SELECT id,document FROM catalog_ingredient')
                actual = {iid: fingerprint(json.loads(doc)) for iid, doc in cursor.fetchall()}
                assert all(actual[i['id']] == i['after'] for i in patch['ingredients'])
                connection.commit()
            else:
                connection.rollback()
            return {'publicRecipes': len(updates['recipes']), 'changedIngredients': len(updates['ingredients']),
                    'executed': execute, 'rollback': rollback}
    except Exception:
        connection.rollback()
        raise


def rollback_patch(connection, patch, before):
    """Only this release's nutrition fields; fail closed if any target changed."""
    connection.begin()
    try:
        with connection.cursor() as c:
            c.execute('SELECT document FROM catalog_metadata WHERE id=1 FOR UPDATE')
            metadata = json.loads(c.fetchone()[0])
            assert all(fingerprint(metadata.get(k)) == fingerprint(v) for k, v in patch['metadataAfter'].items())
            expected_recipes = {r['id']: r for r in patch['recipes']}
            for rid, nutrition in before['recipes']:
                c.execute('SELECT document FROM catalog_recipe WHERE id=%s AND owner_id IS NULL FOR UPDATE', (rid,))
                recipe = json.loads(c.fetchone()[0])
                assert fingerprint(recipe) == expected_recipes[rid]['after']
                recipe['calculatedNutrition'] = nutrition
                assert fingerprint(recipe) == expected_recipes[rid]['before']
                c.execute('UPDATE catalog_recipe SET document=%s WHERE id=%s AND owner_id IS NULL', (json.dumps(recipe, ensure_ascii=False), rid))
            expected_ingredients = {i['id']: i for i in patch['ingredients']}
            for iid, old in before['ingredients']:
                c.execute('SELECT document FROM catalog_ingredient WHERE id=%s FOR UPDATE', (iid,))
                assert fingerprint(json.loads(c.fetchone()[0])) == expected_ingredients[iid]['after']
                c.execute('UPDATE catalog_ingredient SET document=%s WHERE id=%s', (json.dumps(old, ensure_ascii=False), iid))
            c.execute('UPDATE catalog_metadata SET document=%s WHERE id=1', (json.dumps(before['metadata'], ensure_ascii=False),))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
