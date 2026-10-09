import { useState } from 'react';
import type { ActualMeal, LocalDate, Meal, Plan, PersonalStore } from '../domain/types.ts';
import { isLocalDate, localDate } from '../domain/dates.ts';
import { civilDateOffset } from '../history/recap.ts';
import { ActualEditor, DeleteEditor, PlanEditor, type LocalActions } from './PersonalActions.tsx';
import { MEAL_LABELS } from './components.tsx';
export function Calendar({actions,onShopping}:{actions:LocalActions;onShopping:(plan:Plan)=>void}){
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone as Parameters<typeof localDate>[1];
  const [date,setDate]=useState(()=>localDate(new Date(),zone)),[mode,setMode]=useState<'week'|'month'>('week'),[month,setMonth]=useState(date.slice(0,7));
  const [actual,setActual]=useState<{plan?:Plan;actual?:ActualMeal}|null>(null),[plan,setPlan]=useState<Plan|null>(null),[deletion,setDeletion]=useState<{store:PersonalStore;id:string}|null>(null);
  const weekday=new Date(`${date}T00:00:00.000Z`).getUTCDay();const start=civilDateOffset(date,-((weekday+6)%7));
  const week=Array.from({length:7},(_,i)=>civilDateOffset(start,i));
  const monthDays=/^\d{4}-\d{2}$/.test(month)&&isLocalDate(`${month}-01`)?Array.from({length:new Date(`${month}-01T00:00:00Z`).getUTCMonth()===11?31:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}` as LocalDate):[];
  function done(){setActual(null);setPlan(null);setDeletion(null);}
  return <section aria-labelledby="calendar-title"><h2 id="calendar-title">日历</h2><p>计划与实际分别保存。日期按记录时选定的本地日历保留，跨时区不会改写。</p>
    <button aria-pressed={mode==='week'} onClick={()=>setMode('week')}>本周列表</button>{' '}<button aria-pressed={mode==='month'} onClick={()=>setMode('month')}>月选日</button>
    <label>查看日期<input type="date" value={date} onChange={e=>{if(isLocalDate(e.target.value))setDate(e.target.value);}}/></label>
    {mode==='week'?<div className="card"><h3>本周</h3><button onClick={()=>setDate(civilDateOffset(date,-7))}>上一周</button>{' '}<button onClick={()=>setDate(civilDateOffset(date,7))}>下一周</button><ul className="day-list">{week.map(day=><li key={day}><button aria-pressed={date===day} aria-label={`选择 ${day}`} onClick={()=>setDate(day)}>{day} · 计划 {actions.data.plans.filter(p=>p.date===day).length} · 实际 {actions.data.actualMeals.filter(a=>a.date===day).length}</button></li>)}</ul></div>
      :<div className="card"><label>选择月份<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><div className="month-days">{monthDays.map(day=><button key={day} aria-label={`选择 ${day}`} aria-pressed={date===day} onClick={()=>setDate(day)}>{Number(day.slice(8))}<span className="day-meta">计划 {actions.data.plans.filter(p=>p.date===day).length} / 实际 {actions.data.actualMeals.filter(a=>a.date===day).length}</span></button>)}</div></div>}
    {actual&&<ActualEditor key={actual.actual?.id??`plan-${actual.plan?.id}`} actions={actions} {...actual} onDone={done}/>}
    {plan&&<PlanEditor key={plan.id} actions={actions} plan={plan} onDone={done}/>}
    {deletion&&<DeleteEditor key={deletion.id} actions={actions} {...deletion} onDone={done}/>}
    <h3>{date}</h3><div className="workspace-grid">{(Object.keys(MEAL_LABELS) as Meal[]).map(meal=>{
      const plans=actions.data.plans.filter(p=>p.date===date&&p.meal===meal),actuals=actions.data.actualMeals.filter(a=>a.date===date&&a.meal===meal);
      return <section className="card" key={meal} aria-label={`${date} ${MEAL_LABELS[meal]}`}><h3>{MEAL_LABELS[meal]}</h3><h4>计划</h4>{plans.length?plans.map(p=><div key={p.id}><p>计划 · {p.servings} 人 · {p.snapshots.map(s=>s.name).join('、')}</p><button disabled={!actions.writable||actions.pending} aria-label={`按计划建采购清单 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>onShopping(p)}>按计划建采购清单</button>{' '}<button disabled={!actions.writable||actions.pending} aria-label={`按此记录饮食 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setActual({plan:p});}}>按此记录饮食</button>{' '}<button disabled={!actions.writable||actions.pending} aria-label={`编辑计划 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setPlan(p);}}>编辑计划</button>{' '}<button disabled={!actions.writable||actions.pending} aria-label={`删除计划 ${p.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setDeletion({store:'plans',id:p.id});}}>删除计划</button></div>):<p>暂无计划</p>}
        <h4>实际饮食</h4>{actuals.length?actuals.map(a=><div key={a.id}><p>实际 · {a.snapshots.map(s=>s.name).join('、')}</p>{a.note&&<p>备注：{a.note}</p>}{a.planId&&!actions.data.plans.some(p=>p.id===a.planId)&&<p>来源计划已删除</p>}<button disabled={!actions.writable||actions.pending} aria-label={`编辑实际 ${a.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setActual({actual:a});}}>编辑实际</button>{' '}<button disabled={!actions.writable||actions.pending} aria-label={`删除实际 ${a.snapshots.map(s=>s.name).join('、')}`} onClick={()=>{done();setDeletion({store:'actualMeals',id:a.id});}}>删除实际</button></div>):<p>未记录实际饮食</p>}
      </section>;
    })}</div>
  </section>;
}
