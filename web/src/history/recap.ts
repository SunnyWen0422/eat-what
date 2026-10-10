import type { ActualMeal, DishType, LocalDate, Recap } from '../domain/types.ts';
import { isLocalDate } from '../domain/dates.ts';
/** UTC arithmetic here encodes civil calendar dates, not instants in a stored time zone. */
export function civilDateOffset(date:LocalDate,offset:number):LocalDate {
  if(!isLocalDate(date)||!Number.isInteger(offset))throw new RangeError('Invalid civil date');
  return new Date(Date.parse(`${date}T00:00:00.000Z`)+offset*86_400_000).toISOString().slice(0,10) as LocalDate;
}
export function summarizeActuals(actuals:ActualMeal[],today:LocalDate,days:7|30):Recap{
  if(!isLocalDate(today)||!Array.isArray(actuals)||![7,30].includes(days))throw new RangeError('Invalid recap window');
  const recap:Recap={days:Array.from({length:days},(_,i)=>({date:civilDateOffset(today,i-days+1),status:'unrecorded',recordCount:0})),dishCounts:[],mealCounts:{breakfast:0,lunch:0,dinner:0,snack:0},categoryCounts:{}};
  const counts=new Map<string,number>();
  for(const actual of actuals){
    const day=recap.days.find(d=>d.date===actual.date);if(!day)continue;
    day.status='recorded';day.recordCount++;recap.mealCounts[actual.meal]++;
    const perRecipe=new Map<string,Set<DishType>>();
    for(const snapshot of actual.snapshots){const types=perRecipe.get(snapshot.recipeId)??new Set<DishType>();snapshot.types.forEach(t=>types.add(t));perRecipe.set(snapshot.recipeId,types);}
    for(const [recipeId,types] of perRecipe){counts.set(recipeId,(counts.get(recipeId)??0)+1);for(const type of types)recap.categoryCounts[type]=(recap.categoryCounts[type]??0)+1;}
  }
  recap.dishCounts=Array.from(counts,([recipeId,count])=>({recipeId,count})).sort((a,b)=>b.count-a.count||a.recipeId.localeCompare(b.recipeId));
  return recap;
}
