"""Actual HTTP/transaction checks on the owned public-catalog test runtime only.

No model or production endpoint is used. Uses the second synthetic account and
a vacant historical meal; preserves the natural-dialogue account as evidence.
"""
import argparse
import copy
from datetime import date, timedelta
import json
from pathlib import Path
import re
import time
import urllib.parse

from assistant_v4_acceptance import Acceptance, require, uid
from maturity_runtime import backend_fingerprint


def run(runtime):
    import pymysql
    root = Path(__file__).resolve().parents[1]
    runtime = Path(runtime).resolve()
    require(not runtime.is_relative_to(root), 'Runtime must be outside repository')
    state = json.loads((runtime / 'private/runtime.json').read_text('utf-8'))
    address = urllib.parse.urlparse(state['api'])
    require(address.hostname == '127.0.0.1' and address.scheme == 'http', 'Loopback runtime required')
    require(state['purpose'] == 'canonical-catalog-isolated' and re.fullmatch(r'eatwhat_catalog_local_[0-9a-f]{8}', state['database']), 'Owned catalog runtime required')
    require(state['sourceFingerprint'] == backend_fingerprint(), 'Running backend differs from current source')
    output = runtime / 'daily-state-acceptance.json'
    require(not output.exists(), 'Do not overwrite completed acceptance evidence')
    report = {'productionTouched': False, 'providerHttpAttempts': 0, 'sourceFingerprint': state['sourceFingerprint'], 'checks': []}
    db = pymysql.connect(host='127.0.0.1', port=state['dbPort'], user='root', password=state['password'], database=state['database'], autocommit=True, charset='utf8mb4')
    try:
        a = Acceptance(state, db, None)
        data, port = a.sql('SELECT @@datadir,@@port')[0]
        require(Path(data).resolve() == (runtime / 'private/mysql').resolve() and port == state['dbPort'], 'Database ownership mismatch')
        require(a.sql('SELECT open_id FROM users WHERE id=910002')[0][0] == 'catalog-local-b', 'Synthetic account required')
        day = str(date.today() - timedelta(days=31))
        query = urllib.parse.urlencode({'date': day, 'mealType': 'dinner'})
        require(not a.http('/meal-workspaces/current?' + query, user=910002).get('workspace'), 'Acceptance target already has a workspace')
        empty = a.http('/recipe-records/overview?' + urllib.parse.urlencode({'startDate': day, 'endDate': day}), user=910002)
        require(not empty['plans'], 'Acceptance target already has a record')
        context = {'date': day, 'mealType': 'dinner', 'people': 2, 'compositionMode': 'manual',
                   'counts': {'meat': 1, 'veg': 1, 'soup': 0, 'staple': 0, 'dessert': 0, 'side': 0},
                   'requirements': '', 'ownedIngredients': [], 'recommendationPolicy': 'balanced-v1'}
        w = a.http('/meal-workspaces', {'requestId': uid(), 'expectedWorkspaceRevision': 0, 'context': context}, 910002)
        w = a.http('/meal-workspaces/' + w['id'] + '/commands', {'requestId': uid(), 'expectedWorkspaceRevision': w['revision'], 'planVersion': w['draft']['planVersion'], 'command': 'generate'}, 910002)
        deadline = time.monotonic() + 45
        while w['status'] == 'generating' and time.monotonic() < deadline:
            time.sleep(.2)
            w = a.workspace(w, 910002)
        require(w['status'] == 'draft' and len(w['draft']['dishes']) == 2, 'Native generation did not produce two dishes')
        original = copy.deepcopy(w['draft']['dishes'])
        report['checks'].append('native_home_generation_without_model')
        next_context = copy.deepcopy(w['context'])
        next_context.update(people=3, requirements='下次想吃清淡一点', ownedIngredients=['番茄'])
        next_context['counts'].update(meat=2, veg=2, soup=1)
        w = a.http('/meal-workspaces/' + w['id'] + '/context', {'requestId': uid(), 'expectedWorkspaceRevision': w['revision'], 'context': next_context}, 910002, method='PATCH')
        require(w['status'] == 'draft' and w['draft']['dishes'] == original, 'Editing next settings altered the current menu')
        require(w['context']['people'] == 3, 'Sharing people was not updated')
        report['checks'].append('next_settings_and_people_preserve_fixed_recipe')
        save = {'requestId': uid(), 'expectedWorkspaceRevision': w['revision'], 'planVersion': w['draft']['planVersion'], 'expectedPlanRevision': 0}
        w = a.http('/meal-workspaces/' + w['id'] + '/confirm', save, 910002)
        repeated = a.http('/meal-workspaces/' + w['id'] + '/confirm', save, 910002)
        require(w['confirmation'] == repeated['confirmation'], 'Duplicate save changed the receipt')
        overview = a.http('/recipe-records/overview?' + urllib.parse.urlencode({'startDate': day, 'endDate': day}), user=910002)
        require(len(overview['plans']) == 1, 'Current-date save created more than one record')
        require(set(overview['plans'][0]['dishIds']) == {d['id'] for d in original}, 'Saved record differs from displayed menu')
        require(w['confirmation']['date'] == day and w['confirmation']['mealType'] == 'dinner', 'Save targeted another day or meal')
        report['checks'].append('current_date_save_and_same_request_idempotency')
        next_context = copy.deepcopy(w['context']); next_context['ownedIngredients'] = ['土豆']
        w = a.http('/meal-workspaces/' + w['id'] + '/context', {'requestId': uid(), 'expectedWorkspaceRevision': w['revision'], 'context': next_context}, 910002, method='PATCH')
        reloaded = a.workspace(w, 910002)
        require(reloaded['status'] == 'planned' and reloaded['draft']['dishes'] == original and reloaded['context']['ownedIngredients'] == ['土豆'], 'Reload invalidated a saved menu or overwrote next settings')
        report['checks'].append('saved_record_and_next_settings_survive_reload')
        review = a.http('/diet-reviews?' + urllib.parse.urlencode({'startDate': day, 'endDate': day}), user=910002)
        report['review'] = review
        next_day = str(date.fromisoformat(day) + timedelta(days=1))
        fresh = a.http('/meal-workspaces/current?' + urllib.parse.urlencode({'date': next_day, 'mealType': 'dinner'}), user=910002)
        require(not fresh.get('workspace'), 'The next date inherited the previous meal')
        report['checks'].append('different_day_is_independent')
        # Persist the final result of all ten original questions without asking
        # the provider again, including the seven earlier progress checkpoints.
        natural = runtime / 'natural-conversations'
        original_run = json.loads((natural / 'report.json').read_text('utf-8'))
        settled = []
        for number in range(1, 11):
            path = natural / ('completion' if number in (2, 4, 10) else '') / f'turn-{number:02d}.json'
            initial = json.loads(path.read_text('utf-8'))
            turn = a.http('/assistant/v4/turns/' + initial['turnId'])
            require(turn['status'] == 'completed', f'Original question {number} did not finish')
            settled.append({'number': number, 'status': turn['status'], 'reply': turn.get('reply'), 'cards': turn.get('cards'), 'steps': (turn.get('continuation') or {}).get('steps')})
        report['naturalConversationResults'] = settled
        report['providerAttemptsAlreadyUsed'] = original_run['providerHttpAttempts']
        report['passed'] = True
    finally:
        db.close()
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'checks': report['checks'], 'modelRequests': 0}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True)
    run(parser.parse_args().runtime)
