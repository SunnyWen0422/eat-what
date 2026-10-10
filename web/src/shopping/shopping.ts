import type { MealDraft, PersonalData, Plan, Quantity, RecipeSnapshot, ShoppingDiff, ShoppingFragment, ShoppingItem, ShoppingList, ShoppingListInput, ShoppingSource } from '../domain/types.ts';
import { isInteger, isMealDraft, isPlan, isRecipeSnapshot, isUuid, LIMITS, validateJsonBoundary } from '../domain/validation.ts';
import { mapQuantity, safeAmount, scaleIngredient } from './quantities.ts';
export function canonicalShopping(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonicalShopping).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalShopping(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Fixed-size FNV-1a/64 stale hint, not a security hash. Equality also compares complete canonical content. */
function fingerprint(value:unknown):string {
  let hash=14695981039346656037n;
  for(const byte of new TextEncoder().encode(canonicalShopping(value)))hash=BigInt.asUintN(64,(hash^BigInt(byte))*1099511628211n);
  return hash.toString(16).padStart(16,'0');
}
export function sourceDigest(snapshots:RecipeSnapshot[],servings:number):string {return fingerprint({snapshots,servings});}
export function sourceFromPlan(plan:Plan):ShoppingSource {
  if(!isPlan(plan))throw new TypeError('只能选择有效计划');
  const snapshots=structuredClone(plan.snapshots);return {kind:'plan',id:plan.id,revision:plan.revision,snapshots,servings:plan.servings,digest:sourceDigest(snapshots,plan.servings)};
}
export function sourceFromDraft(draft:MealDraft):ShoppingSource {
  if(!isMealDraft(draft)||!draft.dishes.length)throw new TypeError('只能选择有菜品的当前草稿');
  const snapshots=structuredClone(draft.dishes.map(d=>d.recipe));return {kind:'draft',id:'current',revision:draft.revision,snapshots,servings:draft.servings,digest:sourceDigest(snapshots,draft.servings)};
}
export function isShoppingSource(s:unknown):s is ShoppingSource {
  if(!s||typeof s!=='object'||Array.isArray(s))return false;
  const source=s as ShoppingSource;return validSource(source);
}
function validSource(s:ShoppingSource):boolean {
  return s!==null&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===6&&['kind','id','revision','digest','snapshots','servings'].every(k=>Object.hasOwn(s,k))
    && (s.kind==='plan'?isUuid(s.id)&&isInteger(s.revision,1):s.kind==='draft'&&s.id==='current'&&(s.revision===null||isInteger(s.revision)))
    && isInteger(s.servings,1,50)&&Array.isArray(s.snapshots)&&s.snapshots.length>=1&&s.snapshots.length<=20&&s.snapshots.every(r=>isRecipeSnapshot(r))
    && typeof s.digest==='string'&&/^[a-f0-9]{16}$/.test(s.digest)&&s.digest===sourceDigest(s.snapshots,s.servings);
}
const units:Record<string,{unit:string;factor:number}>={kg:{unit:'g',factor:1000},g:{unit:'g',factor:1},L:{unit:'ml',factor:1000},ml:{unit:'ml',factor:1},'个':{unit:'个',factor:1}};
function add(a:Quantity|null,b:Quantity):Quantity {
  if(a===null)return structuredClone(b);
  if(a.unit!==b.unit)throw new TypeError('不可合并不同单位');
  const min=safeAmount((a.kind==='exact'?a.value:a.min)+(b.kind==='exact'?b.value:b.min));
  const max=safeAmount((a.kind==='exact'?a.value:a.max)+(b.kind==='exact'?b.value:b.max));
  return a.kind==='exact'&&b.kind==='exact'?{kind:'exact',value:min,unit:a.unit}:{kind:'range',min,max,unit:a.unit};
}
const serializedBytes=(value:unknown):number=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function reserveExpansion():(bytes:number)=>void {
  let used=0;
  return (bytes:number)=>{used+=bytes;if(used>LIMITS.bytes)throw new RangeError('Data exceeds 20 MiB');};
}
/** Count complete JSON including repeated references, without building the expanded serialization string. */
function checkExpandedSerialization(value:unknown,cachedBytes:Map<object,number>):void {
  const reserve=reserveExpansion();
  function walk(current:unknown):void {
    if(current!==null&&typeof current==='object'){
      const cached=cachedBytes.get(current);if(cached!==undefined){reserve(cached);return;}
      if(Array.isArray(current)){
        reserve(2);for(const [index,child] of current.entries()){if(index>0)reserve(1);walk(child);}return;
      }
      reserve(2);for(const [index,[key,child]] of Object.entries(current).entries()){if(index>0)reserve(1);reserve(serializedBytes(key)+1);walk(child);}return;
    }
    reserve(serializedBytes(current));
  }
  walk(value);
}
/** No fuzzy identity: only reviewed canonical IDs, resolved compounds and known identical forms/parts merge. */
export function buildShopping(sources:ShoppingSource[]):ShoppingListInput {
  if(!validateJsonBoundary(sources).ok||!Array.isArray(sources)||!sources.length||!sources.every(validSource))throw new TypeError('无效采购来源或指纹');
  if(new Set(sources.map(s=>`${s.kind}/${s.id}`)).size!==sources.length)throw new TypeError('重复选择采购来源');
  const sourceBytes=serializedBytes(sources);
  const cachedBytes=new Map<object,number>([[sources,sourceBytes]]);
  const reserve=reserveExpansion();reserve(serializedBytes({sources:null,items:[]})-4+sourceBytes);
  const rows:{fragment:ShoppingFragment;identity:string|null;unit:string|null;unitUnknown:boolean;quantity:Quantity|null;occurrence:string}[]=[];
  for(const s of sources)for(const [recipeIndex,snapshot] of s.snapshots.entries()){
    const snapshotBytes=cachedBytes.get(snapshot)??serializedBytes(snapshot);cachedBytes.set(snapshot,snapshotBytes);
    for(const [ingredientIndex,ingredient] of snapshot.ingredients.entries()){
      const scaled=scaleIngredient(ingredient,snapshot.baseServings,s.servings);
      const known=scaled.factor!==null&&scaled.quantity!==null;
      const originalUnit=scaled.originalQuantity?.unit;
      const conversion=originalUnit!==undefined&&Object.hasOwn(units,originalUnit)?units[originalUnit]:undefined;
      const identity=ingredient.trust==='reviewed'&&ingredient.ingredientId!==null&&ingredient.form.trim()!==''&&ingredient.compoundResolved?canonicalShopping([ingredient.ingredientId,ingredient.form,ingredient.part]):null;
      const quantity=known?conversion?mapQuantity(scaled.quantity!,conversion.factor,conversion.unit):scaled.quantity:null;
      // References only during planning. Admit every full snapshot occurrence before materializing copies.
      const fragment:ShoppingFragment={sourceKind:s.kind,sourceId:s.id,sourceRevision:s.revision,sourceDigest:s.digest,recipeIndex,ingredientIndex,snapshot,scaled};
      const fragmentBytes=serializedBytes({...fragment,snapshot:null})-4+snapshotBytes;
      reserve(fragmentBytes*(quantity===null?2:1)); // sources plus the unknownEntries occurrence
      rows.push({fragment,identity,unit:conversion?.unit??null,unitUnknown:originalUnit===undefined,quantity,occurrence:canonicalShopping([s.kind,s.id,recipeIndex,ingredientIndex])});
    }
  }
  const compatibleUnits=new Map<string,Set<string>>();
  for(const row of rows)if(row.identity&&row.unit){const set=compatibleUnits.get(row.identity)??new Set<string>();set.add(row.unit);compatibleUnits.set(row.identity,set);}
  const grouped=new Map<string,ShoppingItem>();const keys=new Map<string,string>();
  for(const row of rows){
    const candidates=row.identity?compatibleUnits.get(row.identity):undefined;
    const pendingUnit=row.unitUnknown&&candidates?.size===1?Array.from(candidates)[0]:null;
    const group=row.identity&&(row.unit||row.unitUnknown)?canonicalShopping(['canonical',row.identity,row.unit??pendingUnit??'unknown']):canonicalShopping(['occurrence',row.occurrence]);
    const key=`generated:${fingerprint(group)}`;
    if(keys.has(key)&&keys.get(key)!==group)throw new TypeError('采购条目指纹冲突，未生成清单');keys.set(key,group);
    let item=grouped.get(group);
    if(!item){const i=row.fragment.scaled.ingredient;item={key,name:i.ingredientId??i.raw,ingredientId:i.ingredientId,form:i.form,part:i.part,quantity:null,unknownEntries:[],sources:[],userQuantity:null,purchased:false,manual:false};grouped.set(group,item);}
    item.sources.push(row.fragment);
    if(row.quantity!==null)item.quantity=add(item.quantity,row.quantity);else item.unknownEntries.push(row.fragment);
  }
  const planned={sources,items:Array.from(grouped.values())};
  // Exact collection/item/quantity/escaped-string overhead is checked before any full snapshot copy.
  checkExpandedSerialization(planned,cachedBytes);
  const boundary=validateJsonBoundary(planned);if(!boundary.ok)throw new RangeError(boundary.error.message);
  return {sources:structuredClone(sources),items:planned.items.map(item=>({...item,sources:item.sources.map(fragment=>structuredClone(fragment)),unknownEntries:item.unknownEntries.map(fragment=>structuredClone(fragment))}))};
}
function generatedFacts(item:ShoppingItem):unknown {const {userQuantity:_u,purchased:_p,...facts}=item;return facts;}
export function diffShopping(previous:ShoppingList,next:ShoppingListInput):ShoppingDiff {
  const before=new Map(previous.items.map(i=>[i.key,i])),after=new Map(next.items.map(i=>[i.key,i]));
  return structuredClone({added:next.items.filter(i=>!before.has(i.key)),removed:previous.items.filter(i=>!after.has(i.key)),changed:next.items.filter(i=>before.has(i.key)&&canonicalShopping(generatedFacts(before.get(i.key)!))!==canonicalShopping(generatedFacts(i))).map(i=>({previous:before.get(i.key)!,next:i})),previousEdits:previous.items.filter(i=>i.userQuantity!==null||i.purchased||i.manual)});
}
export function sourceState(source:ShoppingSource,data:PersonalData,currentDraft?:ShoppingSource|null):'unchanged'|'changed'|'deleted' {
  if(source.kind==='draft'&&currentDraft!==undefined){
    if(currentDraft===null)return 'deleted';
    return currentDraft.revision===source.revision&&currentDraft.digest===source.digest&&canonicalShopping({snapshots:currentDraft.snapshots,servings:currentDraft.servings})===canonicalShopping({snapshots:source.snapshots,servings:source.servings})?'unchanged':'changed';
  }
  const current=source.kind==='plan'?data.plans.find(p=>p.id===source.id):data.draft;
  if(!current)return 'deleted';
  let latest:ShoppingSource;try{latest=source.kind==='plan'?sourceFromPlan(current as Plan):sourceFromDraft(current as MealDraft);}catch{return 'changed';}
  return latest.revision===source.revision&&latest.digest===source.digest&&canonicalShopping({snapshots:latest.snapshots,servings:latest.servings})===canonicalShopping({snapshots:source.snapshots,servings:source.servings})?'unchanged':'changed';
}
