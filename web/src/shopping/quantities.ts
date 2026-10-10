import type { Ingredient, Quantity, ScaledIngredient } from '../domain/types.ts';
import { isIngredient, isInteger } from '../domain/validation.ts';
/** Derived amounts have a separate ceiling; original recipe amounts retain the 1,000,000 cap. */
export const ARITHMETIC_CEILING = Number.MAX_SAFE_INTEGER;
export function safeAmount(value:number):number {
  if(!Number.isFinite(value)||value<=0||value>ARITHMETIC_CEILING)throw new RangeError('采购用量超出安全计算上限');
  return value;
}
export function mapQuantity(quantity:Quantity,factor:number,unit=quantity.unit):Quantity {
  return quantity.kind==='exact'?{kind:'exact',value:safeAmount(quantity.value*factor),unit}:{kind:'range',min:safeAmount(quantity.min*factor),max:safeAmount(quantity.max*factor),unit};
}
export function scaleIngredient(ingredient:Ingredient,baseServings:number|null,targetServings:number):ScaledIngredient {
  if(!isIngredient(ingredient)||!isInteger(targetServings,1,50)||(baseServings!==null&&!isInteger(baseServings,1,50)))throw new TypeError('无效原料或人数');
  const cloned=structuredClone(ingredient);
  const result:ScaledIngredient={ingredient:cloned,originalQuantity:structuredClone(ingredient.quantity),quantity:structuredClone(ingredient.quantity),baseServings,factor:null,reason:null};
  if(ingredient.quantity===null)result.reason='结构用量未知，需自行确认';
  else if(ingredient.trust!=='reviewed')result.reason='用量未经审核，保留原量供确认';
  else if(baseServings===null)result.reason='基准人数未知，未换算';
  else {result.factor=targetServings/baseServings;result.quantity=mapQuantity(ingredient.quantity,result.factor);}
  return result;
}
/** Display only: exact stored arithmetic is never rounded or written back. */
export function formatQuantity(quantity:Quantity|null):string {
  if(quantity===null)return '待确认';
  const display=(n:number)=>{const rounded=Number(n.toFixed(6));if(rounded===0&&n>0)return '小于 0.000001';return `${rounded!==n?'约 ':''}${rounded}`;};
  return quantity.kind==='exact'?`${display(quantity.value)} ${quantity.unit}`:`${display(quantity.min)}–${display(quantity.max)} ${quantity.unit}`;
}
