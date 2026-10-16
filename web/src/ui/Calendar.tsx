import type { WebViewState } from './App.tsx';
import { RecipeImage } from './RecipeImage.tsx';
import { useState } from 'react';
import type { ActualMeal, LocalDate, Meal, Plan, PersonalStore } from '../domain/types.ts';
import { isLocalDate, localDate } from '../domain/dates.ts';
import { civilDateOffset } from '../history/recap.ts';
import { ActualEditor, DeleteEditor, PlanEditor, type LocalActions } from './PersonalActions.tsx';
import { MEAL_LABELS } from './components.tsx';
export function Calendar({actions,onShopping,viewState,onViewState}:{actions:LocalActions;onShopping:(plan:Plan)=>void;viewState?:WebViewState['calendar'];onViewState?:(state:WebViewState['calendar'])=>void}){
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone as Parameters<typeof localDate>[1];
  const [localView,setLocalView]=useState<WebViewState['calendar']>(()=>({date:localDate(new Date(),zone),mode:'week',month:localDate(new Date(),zone).slice(0,7)}));
  const {date,mode,month}=viewState??localView;
  function update(patch:Partial<WebViewState['calendar']>){const next={...(viewState??localView),...patch};if(onViewState)onViewState(next);else setLocalView(next);}
  const setDate=(date:LocalDate)=>update({date}),setMode=(mode:'week'|'month')=>update({mode}),setMonth=(month:string)=>update({month});
  const [actual,setActual]=useState<{plan?:Plan;actual?:ActualMeal}|null>(null),[plan,setPlan]=useState<Plan|null>(null),[deletion,setDeletion]=useState<{store:PersonalStore;id:string}|null>(null);
  const today=localDate(new Date(),zone);
  const weekday=new Date(`${date}T00:00:00.000Z`).getUTCDay();const start=civilDateOffset(date,-((weekday+6)%7));
  const week=Array.from({length:7},(_,i)=>civilDateOffset(start,i));
  const monthDays=/^\d{4}-\d{2}$/.test(month)&&isLocalDate(`${month}-01`)?Array.from({length:new Date(`${month}-01T00:00:00Z`).getUTCMonth()===11?31:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}` as LocalDate):[];
  function done(){setActual(null);setPlan(null);setDeletion(null);}
  return <section className="dish-surface calendar-page" aria-labelledby="calendar-title"><h2 id="calendar-title">日历</h2>
    <button aria-pressed={mode==='week'} onClick={()=>setMode('week')}>本周列表</button>{' '}<button aria-pressed={mode==='month'} onClick={()=>setMode('month')}>月选日</button>
    <label>查看日期<input data-view-anchor="calendar-date" type="date" value={date} onChange={e=>{if(isLocalDate(e.target.value))setDate(e.target.value);}}/></label>
    {mode==='week'?<div className="card"><h3>本周</h3><button onClick={()=>setDate(civilDateOffset(date,-7))}>上一周</button>{' '}<button onClick={()=>setDate(civilDateOffset(date,7))}>下一周</button><ul className="day-list">{week.map(day=><li key={day}><button aria-pressed={date===day} aria-label={`选择 ${day}，计划${actions.data.plans.filter(p=>p.date===day).length}餐，实际记录${actions.data.actualMeals.filter(a=>a.date===day).length}餐`} onClick={()=>setDate(day)}>{day} · 计划 {actions.data.plans.filter(p=>p.date===day).length} · 实际 {actions.data.actualMeals.filter(a=>a.date===day).length}</button></li>)}</ul></div>
      :<div className="card"><label>选择月份<input data-view-anchor="calendar-month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><div className="month-days">{monthDays.map(day=><button data-view-anchor={`calendar-day-${day}`} key={day} aria-label={`选择 ${day}，计划${actions.data.plans.filter(p=>p.date===day).length}餐，实际记录${actions.data.actualMeals.filter(a=>a.date===day).length}餐`} aria-pressed={date===day} onClick={()=>setDate(day)}>{Number(day.slice(8))}<span className="day-meta" aria-hidden="true">{actions.data.actualMeals.some(a=>a.date===day)?'✓':actions.data.plans.some(p=>p.date===day)?'•':''}</span></button>)}</div></div>}
    {actual&&<ActualEditor key={actual.actual?.id??`plan-${actual.plan?.id}`} actions={actions} {...actual} onDone={done}/>}
    {plan&&<PlanEditor key={plan.id} actions={actions} plan={plan} onDone={done}/>}
    {deletion&&<DeleteEditor key={deletion.id} actions={actions} {...deletion} onDone={done}/>}
    <h3>{date}</h3><div className="workspace-grid">{(Object.keys(MEAL_LABELS) as Meal[]).map(meal=>{
      const plans=actions.data.plans.filter(p=>p.date===date&&p.meal===meal),actuals=actions.data.actualMeals.filter(a=>a.date===date&&a.meal===meal);
      const disabled=!actions.writable||actions.pending;
      const planContent=plans.length?plans.map(p=><div key={p.id} className="calendar-plan"><p className="muted">已安排 · {p.servings} 人</p>{p.snapshots.map(s=><div className="dish-identity recipe-card" key={s.recipeId}><RecipeImage snapshot={s}/><strong>{s.name}</strong></div>)}
        {!actuals.length&&(p.date<=today?<button className="primary" disabled={disabled} aria-label={`按此记录饮食 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setActual({plan:p});}}>记录这餐</button>:<button className="primary" disabled={disabled} aria-label={`按计划建采购清单 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>onShopping(p)}>准备食材</button>)}
        <details className="meal-more"><summary>更多餐次操作</summary>
          {(p.date<=today||actuals.length>0)&&<button disabled={disabled} aria-label={`按计划建采购清单 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>onShopping(p)}>按这份菜单准备食材</button>}
          {actuals.length>0&&p.date<=today&&<button disabled={disabled} aria-label={`按此记录饮食 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setActual({plan:p});}}>核对实际记录</button>}
          <button disabled={disabled} aria-label={`编辑计划 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setPlan(p);}}>编辑计划</button>
          <button disabled={disabled} aria-label={`删除计划 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setDeletion({store:'plans',id:p.id});}}>移除安排</button>
        </details></div>):<p className="muted">暂无计划</p>;
      return <section className="card meal-card" key={meal} aria-label={`${date} ${MEAL_LABELS[meal]}`}><h3>{MEAL_LABELS[meal]}</h3>
        {actuals.length?<><p className="muted">已记录实际用餐</p>{actuals.map(a=><div key={a.id}>{a.snapshots.map(s=><div className="dish-identity recipe-card" key={s.recipeId}><RecipeImage snapshot={s}/><strong>{s.name}</strong></div>)}{a.note&&<p>备注：{a.note}</p>}{a.planId&&!actions.data.plans.some(p=>p.id===a.planId)&&<p className="muted">来源计划已删除</p>}
          <button className="primary" disabled={disabled} aria-label={`编辑实际 ${a.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setActual({actual:a});}}>更正实际记录</button>
          <details><summary>更多记录操作</summary><button disabled={disabled} aria-label={`删除实际 ${a.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setDeletion({store:'actualMeals',id:a.id});}}>删除实际记录</button></details></div>)}
          {plans.length>0&&<details className="original-plan"><summary>查看原安排</summary>{planContent}</details>}</>:<>{planContent}<p className="muted">未记录实际饮食</p></>}
      </section>;
    })}</div>
  </section>;
}
