import type { ActualMealInput, LocalDate, Meal, PersonalData, Plan, RecipeSnapshot, Result, TrashEntry } from '../domain/types.ts';
import type { Command } from '../data/repository.ts';
import { isActualMealInput, isPlan, isTrashEntry, MEAL_VALUES, validatePersonalData } from '../domain/validation.ts';
import { isLocalDate } from '../domain/dates.ts';
import { snapshotRecipe } from '../domain/snapshots.ts';
const fail = <T>(code:'INVALID'|'DUPLICATE'|'FUTURE_DATE'|'CONFLICT',message:string):Result<T>=>({ok:false,error:{code,message}});
/** Retain the selected facts, never refetch/rewrite a historical snapshot. */
export function recordFromPlan(plan:Plan,selection:RecipeSnapshot[],date:LocalDate,meal:Meal,today:LocalDate):Result<ActualMealInput>{
  if(!isPlan(plan)||!isLocalDate(today))return fail('INVALID','Invalid plan or today');
  const input:ActualMealInput={date,meal,snapshots:selection,planId:plan.id,note:'',timeZone:plan.timeZone};
  if(!isActualMealInput(input))return fail('INVALID','Choose at least one valid dish and a date/meal');
  if(date>today)return fail('FUTURE_DATE','Future dates can only be saved as plans');
  return {ok:true,value:{...input,snapshots:selection.map(snapshotRecipe)}};
}
export function restoreTrash(entry:TrashEntry,data:PersonalData,target?:{date:LocalDate;meal:Meal}):Result<Command>{
  if(!isTrashEntry(entry)||!validatePersonalData(data).ok||target&&(!isLocalDate(target.date)||!MEAL_VALUES.includes(target.meal)))return fail('INVALID','Invalid restore input');
  if(!data.trash.some(t=>t.id===entry.id&&t.revision===entry.revision))return fail('CONFLICT','The deleted object changed');
  if(data[entry.store].some(r=>r.id===entry.originalId))return fail('DUPLICATE','An object with this identity already exists');
  if(entry.store==='favorites'&&data.favorites.some(f=>f.recipeId===entry.data.recipeId))return fail('DUPLICATE','This recipe is already favorited');
  if(target&&entry.store!=='plans')return fail('INVALID','Only a conflicting plan can choose another date and meal');
  if(entry.store==='plans'){
    const chosen=target??entry.data;
    if(data.plans.some(p=>p.date===chosen.date&&p.meal===chosen.meal))return fail('DUPLICATE','Choose another plan date/meal or cancel');
  }
  return {ok:true,value:{type:'restoreTrash',id:entry.id,expectedObjectRevision:entry.revision,...(target?{target:structuredClone(target)}:{})}};
}
