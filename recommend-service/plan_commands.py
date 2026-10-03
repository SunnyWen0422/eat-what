"""Deterministic edits of assistant drafts; no application data writes."""
from __future__ import annotations
import copy
from typing import Any, Dict, Sequence

class PlanCommandError(ValueError):
    pass

def _slots(plan):
    return {(meal.get('date'), meal.get('meal_type'), str(dish.get('id'))): dish
            for meal in (plan or {}).get('meals', []) for dish in meal.get('dishes', [])}

def next_plan_state(previous: Dict[str, Any], proposed) -> Dict[str, Any]:
    state = copy.deepcopy(previous)
    current = previous.get('plan')
    if proposed is None:
        return state
    plan = copy.deepcopy(proposed)
    current_slots, proposed_slots = _slots(current), _slots(plan)
    for key, dish in current_slots.items():
        if not dish.get('locked'): continue
        if key not in proposed_slots: raise PlanCommandError('已保留的菜不可被替换，请先解除保留')
        proposed_slots[key]['locked'] = True
    version = max(int(state.get('next_plan_version') or 1), int((current or {}).get('version') or 0) + 1)
    plan['version'] = version
    history = list(state.get('plan_history') or [])
    state.update(plan=plan, plan_history=(history + [copy.deepcopy(plan)])[-10:],
                 active_plan_version=version, next_plan_version=version + 1)
    return state

def apply_command(previous: Dict[str, Any], command: Dict[str, Any], candidates: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    current = previous.get('plan')
    if not current: raise PlanCommandError('没有可修改的方案')
    if int(command.get('plan_version') or 0) != int(current.get('version') or 0):
        raise PlanCommandError('方案已更新，请重新加载后确认')
    action = command.get('action')
    plan = copy.deepcopy(current)
    if action == 'undo':
        history = copy.deepcopy(previous.get('plan_history') or [])
        if len(history) < 2: raise PlanCommandError('没有可撤销的修改')
        restored = history[-2]
        version = int(previous.get('next_plan_version') or current['version'] + 1)
        restored['version'] = version
        state = copy.deepcopy(previous)
        state.update(plan=restored, plan_history=history[:-2] + [copy.deepcopy(restored)],
                     active_plan_version=version, next_plan_version=version + 1)
        state['plan_archive'] = (list(state.get('plan_archive') or []) + [copy.deepcopy(current)])[-10:]
        return state
    if action == 'keep_all':
        for dish in _slots(plan).values(): dish['locked'] = True
    elif action in ('keep', 'release', 'replace'):
        key = (command.get('date'), command.get('meal_type'), str(command.get('dish_id')))
        target = _slots(plan).get(key)
        if target is None: raise PlanCommandError('目标菜品已变化，请重新选择')
        if action == 'replace':
            if target.get('locked'): raise PlanCommandError('这道菜已保留，请先解除保留')
            occupied = {key[2] for key in _slots(plan)}
            replacement = next((copy.deepcopy(dish) for dish in candidates
                                if dish.get('type') == target.get('type') and str(dish.get('id')) not in occupied), None)
            if replacement is None: raise PlanCommandError('当前条件下没有同类替代菜，原方案已保留')
            for meal in plan['meals']:
                if (meal.get('date'), meal.get('meal_type')) != key[:2]: continue
                meal['dishes'] = [replacement if str(dish.get('id')) == key[2] else dish for dish in meal['dishes']]
        else: target['locked'] = action == 'keep'
    else: raise PlanCommandError('操作无效')
    # Release is an explicit user command; model-generated changes cannot release a lock.
    base = copy.deepcopy(previous)
    if action == 'release': _slots(base['plan'])[key]['locked'] = False
    return next_plan_state(base, plan)
