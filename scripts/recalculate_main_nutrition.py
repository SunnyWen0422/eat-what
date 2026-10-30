"""Offline main-ingredient policy transition; preserve input and all recipe facts."""
import argparse
import copy
import json
from collections import Counter
from pathlib import Path
from decimal import Decimal, localcontext, ROUND_HALF_UP
from enrich_canonical_nutrition import compile_calculator, recalculate, load, save, sha, require
from prepare_catalog_v4 import fingerprint
from canonical_catalog_import import validate_bundle

VERSION = 'eatwhat-main-ingredients-20261029-v1'
NUTRIENTS = ('energyKcal','proteinG','fatG','carbohydrateG','fiberG','sodiumMg')


def verify_totals(recipe, definitions, actual):
    """Independent decimal sum over enabled main lines, with no inferred amounts."""
    with localcontext() as ctx:
        ctx.prec = 50
        sums = {n:Decimal(0) for n in NUTRIENTS}
        for line in recipe['ingredients']:
            if line['role'] != 'main' or not line['defaultEnabled']:
                continue
            d = definitions[line['ingredientId']]
            q, g, facts = line.get('quantity'), d.get('gramsPerUnit'), d.get('nutritionPer100g')
            if q is None or g is None or not facts or line.get('nutritionContribution') == 'unknown':
                continue
            for n in NUTRIENTS:
                sums[n] += Decimal(str(q))*Decimal(str(g))*Decimal(str(facts[n]))/100*Decimal(str(line.get('nutrientRetention',{}).get(n,1)))
        for n, expected in sums.items():
            got = Decimal(str(actual['quantifiedSubtotal']['total'][n]))
            require(abs(got-expected.quantize(Decimal('0.000000000001'),rounding=ROUND_HALF_UP)) <= Decimal('0.000000001'),
                    f'Independent main-only sum mismatch {recipe["id"]} {n}')


def build(source, output, jackson_classpath=None):
    source, output = Path(source).resolve(), Path(output).resolve()
    require(not output.exists(), 'Output directory must be new')
    require(output not in source.parents, 'Output cannot contain source')
    digest = sha(source)
    original = load(source)
    validate_bundle(original)
    output.mkdir(parents=True)
    cp, calculator_sha = compile_calculator(output, jackson_classpath)
    actual = recalculate(source, output / 'java-nutrition.jsonl', cp)
    candidate = copy.deepcopy(original)
    candidate['sourceCatalogRevision'] = original['catalogRevision']
    candidate['catalogRevision'] = 'eatwhat-catalog-20261029-main-nutrition-1'
    candidate['nutritionRuleVersion'] = VERSION
    definitions = {i['id']: i for i in candidate['ingredients']}
    reasons, no_main, changed = Counter(), [], []
    for recipe in candidate['recipes']:
        n = actual[recipe['id']]
        verify_totals(recipe, definitions, n)
        require(n.get('scope') == 'main_ingredients', 'Wrong calculator nutrition scope')
        main = {i['id'] for i in recipe['ingredients'] if i['role'] == 'main' and i['defaultEnabled']}
        require(set(n['unknownLineIds']) <= main, 'Non-main ingredient blocks nutrition')
        if not main:
            no_main.append(recipe['id'])
            require(n['total'] is None, 'No main ingredients cannot mean zero nutrition')
        reasons.update({i['reason'] for i in n['unknownReasons']})
        if recipe['calculatedNutrition'] != n:
            changed.append(recipe['id'])
        recipe['calculatedNutrition'] = {'ruleVersion': VERSION,
            'dependencySha256': fingerprint(recipe, definitions, VERSION), **n}
    validate_bundle(candidate)
    require(original['ingredients'] == candidate['ingredients'], 'Ingredient definitions changed')
    for a, b in zip(original['recipes'], candidate['recipes']):
        require({k:v for k,v in a.items() if k != 'calculatedNutrition'} ==
                {k:v for k,v in b.items() if k != 'calculatedNutrition'}, 'Recipe facts changed')
    require(digest == sha(source), 'Original changed')
    target = output / 'runtime-catalog.json'
    save(target, candidate)
    audit = {'sourceSha256':digest,'candidateSha256':sha(target),'calculatorSha256':calculator_sha,
        'ruleVersion':VERSION,'scope':'main_ingredients','recipes':len(candidate['recipes']),
        'ingredients':len(candidate['ingredients']), 'completeBefore':sum(r['calculatedNutrition']['completeness']=='complete' for r in original['recipes']),
        'completeAfter':sum(r['calculatedNutrition']['completeness']=='complete' for r in candidate['recipes']),
        'noMainRecipeIds':no_main,'remainingReasonRecipeCounts':dict(reasons),
        'allRecipeFactsPreserved':True,'allIngredientDefinitionsPreserved':True,
        'independentDecimalComparisons':len(candidate['recipes'])*len(NUTRIENTS),
        'note':'Coverage is for main ingredients only; not comparable to former whole-recipe nutrition coverage.'}
    save(output / 'audit.json',audit)
    return audit


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    p.add_argument('--jackson-classpath');a=p.parse_args()
    print(json.dumps(build(a.source,a.output,a.jackson_classpath),ensure_ascii=False))
