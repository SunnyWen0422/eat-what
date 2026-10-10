import { useRef, useState } from 'react';
import type { ActualMeal, Catalog, CustomRecipe, Ingredient, LocalDate, Meal, MenuTemplate, PersonalData, PersonalStore, Plan, RecipeSnapshot, Result, TimeZone, TrashEntry } from '../domain/types.ts';
import type { Command, CommitReceipt } from '../data/repository.ts';
import { isLocalDate, localDate } from '../domain/dates.ts';
import { snapshotRecipe } from '../domain/snapshots.ts';
import { isActualMealInput, isCustomRecipeInput, isMenuTemplateInput, isPlanInput, TYPE_VALUES } from '../domain/validation.ts';
import { recordFromPlan, restoreTrash } from '../history/records.ts';
import { Dialog, errorMessage, MEAL_LABELS, Notice } from './components.tsx';
export const TYPE_LABELS = {meat:'荤菜',vegetable:'素菜',staple:'主食',soup:'汤羹',breakfastSnack:'早餐/加餐'};
export interface LocalActions {
  data:PersonalData; catalog:Result<Catalog>|null; writable:boolean; pending:boolean;
  commit:(command:Command,expectedRevision:number,requestId:string)=>Promise<Result<CommitReceipt>>;
  readLatest:()=>Promise<Result<PersonalData>>;
  onSelect:(recipe:RecipeSnapshot)=>void;
  onUseTemplate:(template:MenuTemplate)=>void;
}
function rebaseCommand(command:Command,data:PersonalData):Command|null {
  if(command.type==='saveActual'||command.type==='savePlan'||command.type==='saveCustomRecipe'||command.type==='saveTemplate'||command.type==='saveShoppingList'){
    const input=command.type==='saveActual'?command.actual:command.type==='savePlan'?command.plan:command.type==='saveCustomRecipe'?command.recipe:command.type==='saveTemplate'?command.template:command.list;
    if(!input.id)return command;
    const store=command.type==='saveActual'?'actualMeals':command.type==='savePlan'?'plans':command.type==='saveCustomRecipe'?'customRecipes':command.type==='saveTemplate'?'menuTemplates':'shoppingLists';
    const current=data[store].find(row=>row.id===input.id);return current?{...command,expectedObjectRevision:current.revision}:null;
  }
  if(command.type==='deleteObject'){const current=data[command.store].find(row=>row.id===command.id);return current?{...command,expectedObjectRevision:current.revision}:null;}
  if(command.type==='restoreTrash'){const current=data.trash.find(row=>row.id===command.id);return current?{...command,expectedObjectRevision:current.revision}:null;}
  return command;
}
function latestObjectLines(command:Command|null,data:PersonalData):string[]{
  if(!command)return [];
  const store=command.type==='saveActual'?'actualMeals':command.type==='savePlan'?'plans':command.type==='saveCustomRecipe'?'customRecipes':command.type==='saveTemplate'?'menuTemplates':command.type==='saveShoppingList'?'shoppingLists':command.type==='deleteObject'?command.store:null;
  const id=command.type==='saveActual'?command.actual.id:command.type==='savePlan'?command.plan.id:command.type==='saveCustomRecipe'?command.recipe.id:command.type==='saveTemplate'?command.template.id:command.type==='saveShoppingList'?command.list.id:command.type==='deleteObject'?command.id:undefined;
  if(!store||!id)return ['最新自定义菜谱：'+(data.customRecipes.map(r=>r.snapshot.name).join('、')||'无'),'最新模板：'+(data.menuTemplates.map(t=>t.name).join('、')||'无')];
  const row=data[store].find(r=>r.id===id);if(!row)return ['原对象在最新记录中已删除'];
  const lines=['最新对象版本：'+row.revision];
  if('date' in row)lines.push(`最新日期/餐次：${row.date} · ${MEAL_LABELS[row.meal]}`);
  if('servings' in row)lines.push('最新人数：'+row.servings);
  if('note' in row)lines.push('最新备注：'+(row.note||'空'));
  if('name' in row)lines.push('最新名称：'+row.name);
  if('items' in row){lines.push('最新采购条目：'+row.items.map(i=>`${i.name} · 手改 ${i.userQuantity??'无'} · ${i.purchased?'已购':'未购'}`).join('；'));return lines;}
  const snapshots='snapshot' in row?[row.snapshot]:row.snapshots;
  lines.push('最新菜品：'+snapshots.map(s=>s.name).join('、'));
  for(const snapshot of snapshots){lines.push(`${snapshot.name} 最新原料：${snapshot.ingredients.map(i=>i.raw).join('、')||'未知'}`);lines.push(`${snapshot.name} 最新步骤：${snapshot.steps.join('；')||'未知'}`);}
  return lines;
}
/** A form owns its baseline and request. Reading newer data never silently rebases its edits. */
export function useLocalMutation(actions:LocalActions){
  const baseline=useRef(actions.data.meta.revision);
  const selectedLatest=useRef<PersonalData|null>(null);
  const request=useRef<{key:string;id:string}|null>(null);
  const busy=useRef(false);
  const attempted=useRef<Command|null>(null);
  const [saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[conflict,setConflict]=useState(false),[duplicate,setDuplicate]=useState(false),[reviewed,setReviewed]=useState<PersonalData|null>(null);
  async function run(original:Command,success:string):Promise<boolean>{
    if(busy.current||!actions.writable)return false;
    if(conflict){setMessage('输入已保留，请先查看最新记录并决定是否保留当前编辑。');return false;}
    const command=selectedLatest.current?rebaseCommand(original,selectedLatest.current):original;
    if(!command){setMessage('原对象已删除。请取消此表单，当前输入仍保留。');setError(true);return false;}
    attempted.current=command;
    const key=JSON.stringify(command);if(request.current?.key!==key)request.current={key,id:globalThis.crypto.randomUUID()};
    busy.current=true;setSaving(true);setError(false);setMessage('正在保存本地记录…');
    try{
      const result=await actions.commit(command,baseline.current,request.current!.id);
      if(result.ok){setMessage(success);setError(false);request.current=null;return true;}
      setError(true);setConflict(result.error.code==='CONFLICT');setDuplicate(result.error.code==='DUPLICATE');
      setMessage(result.error.code==='DUPLICATE'?(command.type==='saveActual'?'此计划已有实际记录，请重新读取后打开已有记录或明确新增。':command.type==='saveFavorite'?'此菜已经收藏，快照仍保留。':command.type==='savePlan'?'此日期和餐次已有计划，请另选或取消。':'对象身份或唯一键已存在，请重新读取后处理。'):errorMessage(result.error.code));return false;
    }catch{setError(true);setMessage('保存结果未确认，请保留输入并用原请求重试。');return false;}
    finally{busy.current=false;setSaving(false);}
  }
  async function review(){const result=await actions.readLatest();if(result.ok){setReviewed(result.value);setMessage('已读取最新记录，当前表单输入未改变。');}else{setMessage(errorMessage(result.error.code));setError(true);}}
  function keep(){if(!reviewed)return;baseline.current=reviewed.meta.revision;selectedLatest.current=reviewed;request.current=null;setReviewed(null);setConflict(false);setError(false);setMessage('当前输入已保留，下一次保存将按已查看的最新版本提交。');}
  return {run,saving,disabled:saving||actions.pending||!actions.writable,message,error,feedback:<>
    {message&&<Notice text={message} error={error}/>}
    {duplicate&&<button disabled={saving} onClick={()=>void review()}>重新读取重复对象</button>}
    {conflict&&<div className="notice error"><p>另一个页面有更新，输入已保留。</p><button disabled={saving} onClick={()=>void review()}>查看此表单的最新记录</button>{reviewed&&<><p>最新版本 {reviewed.meta.revision}，计划 {reviewed.plans.length} 条，实际 {reviewed.actualMeals.length} 条。</p>{latestObjectLines(attempted.current,reviewed).map((line,i)=><p key={i}>{line}</p>)}<p>保留当前编辑会按已查看的版本再次提交；已有对象将替换为当前表单内容。取消可以放弃本次表单。</p><button disabled={saving} onClick={keep}>保留此表单编辑并继续</button></>}</div>}
  </>};
}
export function availableSnapshots(actions:LocalActions):RecipeSnapshot[]{
  const entries=[...(actions.catalog?.ok?actions.catalog.value.recipes:[]),...actions.data.customRecipes.map(r=>r.snapshot),...actions.data.favorites.map(f=>f.snapshot)];
  const current=new Map<string,RecipeSnapshot>();
  // Current catalog/custom rows are authoritative selection sources; retained favorites are fallback only.
  for(const recipe of entries)if(!current.has(recipe.recipeId))current.set(recipe.recipeId,snapshotRecipe(recipe));
  return Array.from(current.values());
}
function SnapshotPicker({selected,onChange,actions,disabled,kind}:{selected:RecipeSnapshot[];onChange:(s:RecipeSnapshot[])=>void;actions:LocalActions;disabled:boolean;kind:'实际'|'计划'|'模板'}){
  return <><h4>确认{kind}菜品</h4><p>只保留确实需要的菜，可以移除或加入手选菜。保存的是当时快照。</p>
    {selected.length?<ul>{selected.map((r,i)=><li key={`${r.recipeId}-${i}`}><p>{r.name}</p><button type="button" disabled={disabled} onClick={()=>onChange(selected.filter((_,index)=>index!==i))} aria-label={`移出${kind} ${r.name}`}>移除这道菜</button></li>)}</ul>:<p>尚未选择菜品</p>}
    <details><summary>加入手选菜品</summary>{availableSnapshots(actions).length?availableSnapshots(actions).map(r=><p key={r.recipeId}><button type="button" disabled={disabled||selected.length>=20||selected.some(s=>s.recipeId===r.recipeId)} onClick={()=>onChange([...selected,snapshotRecipe(r)])} aria-label={`加入${kind} ${r.name}`}>{r.name}</button></p>):<p>没有可加入的菜。可在“我的”新建自定义菜谱。</p>}</details></>;
}
export function ActualEditor({actions,plan,actual,snapshots,onDone}:{actions:LocalActions;plan?:Plan;actual?:ActualMeal;snapshots?:RecipeSnapshot[];onDone:()=>void}){
  const mutation=useLocalMutation(actions);
  const [zone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone);
  const [date,setDate]=useState(actual?.date??plan?.date??localDate(new Date(),zone));
  const [meal,setMeal]=useState<Meal>(actual?.meal??plan?.meal??actions.data.draft?.meal??'dinner');
  const [selection,setSelection]=useState(()=>structuredClone(actual?.snapshots??plan?.snapshots??snapshots??[]));
  const [note,setNote]=useState(actual?.note??'');
  const [additional,setAdditional]=useState(false),[opened,setOpened]=useState<ActualMeal|null>(null),[invalid,setInvalid]=useState('');
  const duplicate=!actual&&plan?actions.data.actualMeals.find(a=>a.planId===plan.id):undefined;
  if(opened)return <ActualEditor actions={actions} actual={opened} onDone={onDone}/>;
  if(duplicate&&!additional)return <Dialog title={actual?'编辑实际记录':'记录实际饮食'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>此计划已有实际记录</h3><p>{duplicate.date} · {MEAL_LABELS[duplicate.meal]} · {duplicate.snapshots.map(s=>s.name).join('、')}</p><button disabled={mutation.disabled} onClick={()=>setOpened(duplicate)}>打开现有实际记录</button>{' '}<button disabled={mutation.disabled} onClick={()=>setAdditional(true)}>明确新增一条实际记录</button>{' '}<button onClick={onDone}>取消记录</button></Dialog>;
  async function save(){
    const currentZone=Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone;
    const today=localDate(new Date(),currentZone);
    const prepared=plan&&!actual?recordFromPlan(plan,selection,date,meal,today):null;
    if(prepared&&!prepared.ok){setInvalid(prepared.error.code==='FUTURE_DATE'?'未来日期只能保存计划':'请选择有效日期、餐次和至少一道菜');return;}
    const input={...(prepared?.ok?prepared.value:{date,meal,snapshots:selection,planId:actual?.planId??null}),...(actual?{id:actual.id}:{}),note,timeZone:actual?.timeZone??zone};
    if(!isActualMealInput(input)){setInvalid('请选择有效日期、餐次和至少一道菜');return;}
    if(date>today){setInvalid('未来日期只能保存计划');return;}
    setInvalid('');if(await mutation.run({type:'saveActual',actual:input,expectedObjectRevision:actual?.revision??null,allowAdditional:additional},'实际记录已保存'))onDone();
  }
  return <Dialog title={actual?'编辑实际记录':'记录实际饮食'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>{actual?'编辑实际记录':'记录实际饮食'}</h3><p>实际饮食与计划分开，未填写用量不代表零用量。</p>
    <label>实际日期<input type="date" value={date} disabled={mutation.disabled} onChange={e=>setDate(e.target.value as LocalDate)}/></label>
    <label>实际餐次<select value={meal} disabled={mutation.disabled} onChange={e=>setMeal(e.target.value as Meal)}>{Object.entries(MEAL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <SnapshotPicker selected={selection} onChange={setSelection} actions={actions} disabled={mutation.disabled} kind="实际"/>
    <label>实际备注<textarea value={note} disabled={mutation.disabled} onChange={e=>setNote(e.target.value)}/></label>
    {invalid&&<Notice error text={invalid}/>} {mutation.feedback}
    <button disabled={mutation.disabled||selection.length===0} onClick={()=>void save()}>确认记录实际</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消记录</button>
  </Dialog>;
}
export function PlanEditor({actions,plan,onDone}:{actions:LocalActions;plan:Plan;onDone:()=>void}){
  const mutation=useLocalMutation(actions);const [date,setDate]=useState(plan.date),[meal,setMeal]=useState(plan.meal),[servings,setServings]=useState(String(plan.servings)),[selection,setSelection]=useState(()=>structuredClone(plan.snapshots)),[invalid,setInvalid]=useState('');
  async function save(){const input={id:plan.id,date,meal,servings:Number(servings),snapshots:selection,timeZone:plan.timeZone};if(!isPlanInput(input)){setInvalid('请选择有效日期、1–50 人和至少一道菜');return;}const other=actions.data.plans.find(p=>p.id!==plan.id&&p.date===date&&p.meal===meal);if(other){setInvalid('此日期和餐次已有其他计划，请另选日期/餐次或取消。');return;}if(await mutation.run({type:'savePlan',plan:input,expectedObjectRevision:plan.revision},'计划编辑已保存'))onDone();}
  return <Dialog title={'编辑计划'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>编辑计划</h3><p>编辑计划不会改变已经记录的实际饮食。</p><label>计划日期<input type="date" disabled={mutation.disabled} value={date} onChange={e=>setDate(e.target.value as LocalDate)}/></label><label>计划餐次<select value={meal} disabled={mutation.disabled} onChange={e=>setMeal(e.target.value as Meal)}>{Object.entries(MEAL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>计划人数<input type="number" min="1" max="50" disabled={mutation.disabled} value={servings} onChange={e=>setServings(e.target.value)}/></label><SnapshotPicker selected={selection} onChange={setSelection} actions={actions} disabled={mutation.disabled} kind="计划"/>{invalid&&<Notice text={invalid} error/>}{mutation.feedback}<button disabled={mutation.disabled} onClick={()=>void save()}>保存计划编辑</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消计划编辑</button></Dialog>;
}
export function DeleteEditor({actions,store,id,onDone}:{actions:LocalActions;store:PersonalStore;id:string;onDone:()=>void}){
  const mutation=useLocalMutation(actions),object=actions.data[store].find(r=>r.id===id);return <Dialog title={'确认删除'} busy={mutation.saving||actions.pending} onClose={onDone}><p>确认删除后移入本地回收站，保留 30 天。其他计划、实际记录和快照不会被联动删除。</p>{mutation.feedback}<button disabled={mutation.disabled||!object} onClick={()=>{if(object)void mutation.run({type:'deleteObject',store,id,expectedObjectRevision:object.revision},'已移入回收站，保留 30 天').then(ok=>{if(ok)onDone();});}}>确认移入回收站</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消删除</button></Dialog>;
}
export function RestoreEditor({actions,entry,onDone}:{actions:LocalActions;entry:TrashEntry;onDone:()=>void}){
  const mutation=useLocalMutation(actions),initial=restoreTrash(entry,actions.data);const [date,setDate]=useState(entry.store==='plans'?entry.data.date:''),[meal,setMeal]=useState<Meal>(entry.store==='plans'?entry.data.meal:'dinner'),[alternate,setAlternate]=useState(false),[invalid,setInvalid]=useState('');
  const conflict=!initial.ok&&initial.error.code==='DUPLICATE';
  async function save(){const checked=restoreTrash(entry,actions.data,alternate?{date:date as LocalDate,meal}:undefined);if(!checked.ok){setInvalid(checked.error.code==='DUPLICATE'?'恢复遇到唯一键冲突，请另选计划日期/餐次或取消。':checked.error.message);return;}if(await mutation.run(checked.value,'已恢复'))onDone();}
  return <Dialog title={'恢复已删除项目'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>恢复已删除项目</h3><p>原过期时间：{entry.expiresAt}</p>{conflict&&<p role="alert">恢复遇到唯一键冲突，不会覆盖已有对象。</p>}{entry.store==='plans'&&<><label><span>另选计划日期和餐次</span><input type="checkbox" checked={alternate} disabled={mutation.disabled} onChange={e=>setAlternate(e.target.checked)}/></label>{alternate&&<><label>恢复计划日期<input type="date" value={date} disabled={mutation.disabled} onChange={e=>setDate(e.target.value)}/></label><label>恢复计划餐次<select value={meal} disabled={mutation.disabled} onChange={e=>setMeal(e.target.value as Meal)}>{Object.entries(MEAL_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></>}</>}{invalid&&<Notice error text={invalid}/>} {mutation.feedback}<button disabled={mutation.disabled||(conflict&&!alternate)} onClick={()=>void save()}>确认恢复</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消恢复</button></Dialog>;
}
export function FavoriteEditor({actions,snapshot,onDone}:{actions:LocalActions;snapshot:RecipeSnapshot;onDone:()=>void}){
  const mutation=useLocalMutation(actions);return <Dialog title={'确认收藏'} busy={mutation.saving||actions.pending} onClose={onDone}><p>收藏将保留当前菜谱快照：{snapshot.name}</p>{mutation.feedback}<button disabled={mutation.disabled} onClick={()=>void mutation.run({type:'saveFavorite',snapshot:snapshotRecipe(snapshot)},'已收藏').then(ok=>{if(ok)onDone();})}>确认收藏</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消本次收藏</button></Dialog>;
}
export function CustomEditor({actions,recipe,onDone}:{actions:LocalActions;recipe?:CustomRecipe;onDone:()=>void}){
  const mutation=useLocalMutation(actions),[name,setName]=useState(recipe?.snapshot.name??''),[raw,setRaw]=useState(recipe?.snapshot.ingredients.map(i=>i.raw).join('\n')??''),[steps,setSteps]=useState(recipe?.snapshot.steps.join('\n')??''),[types,setTypes]=useState(recipe?.snapshot.types??[]),[base,setBase]=useState(recipe?.snapshot.baseServings===null||!recipe?'':String(recipe.snapshot.baseServings)),[invalid,setInvalid]=useState('');
  const originalRaw=recipe?.snapshot.ingredients.map(i=>i.raw).join('\n')??'';
  const originalSteps=recipe?.snapshot.steps.join('\n')??'';
  const ingredientsEdited=raw!==originalRaw,stepsEdited=steps!==originalSteps;
  const [replacementConfirmation,setReplacementConfirmation]=useState(false);
  async function save(confirmReplacement=false){
    if(recipe&&(ingredientsEdited||stepsEdited)&&!confirmReplacement){setReplacementConfirmation(true);return;}
    const ingredients:Ingredient[]=recipe&&!ingredientsEdited?structuredClone(recipe.snapshot.ingredients):raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(raw=>({ingredientId:null,form:'',part:null,raw,quantity:null,trust:'unknown',compoundResolved:false}));
    const input={...(recipe?{id:recipe.id}:{}),name:name.trim(),types,ingredients,steps:recipe&&!stepsEdited?structuredClone(recipe.snapshot.steps):steps.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),baseServings:base===''?null:Number(base)};
    if(!isCustomRecipeInput(input)){setInvalid('菜名必填，基准人数可留空或填写 1–50。原料用量原文保留，未填写为未知。');return;}
    if(await mutation.run({type:'saveCustomRecipe',recipe:input,expectedObjectRevision:recipe?.revision??null},'自定义菜谱已保存'))onDone();
  }
  return <Dialog title={recipe?'编辑自定义菜谱':'新建自定义菜谱'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>{recipe?'编辑自定义菜谱':'新建自定义菜谱'}</h3><p>仅供手选，不进入自动候选。填写原料不会变为审核信息。</p><label>自定义菜名<input value={name} disabled={mutation.disabled} onChange={e=>setName(e.target.value)}/></label><fieldset disabled={mutation.disabled}><legend>分类，可不选</legend>{TYPE_VALUES.map(t=><label key={t}><span>{TYPE_LABELS[t]}</span><input type="checkbox" checked={types.includes(t)} onChange={e=>setTypes(e.target.checked?[...types,t]:types.filter(v=>v!==t))}/></label>)}</fieldset><label>原料及用量原文，每行一项，可留空<textarea value={raw} disabled={mutation.disabled} onChange={e=>{setRaw(e.target.value);setReplacementConfirmation(false);}}/></label><label>步骤，每行一步，可留空<textarea value={steps} disabled={mutation.disabled} onChange={e=>{setSteps(e.target.value);setReplacementConfirmation(false);}}/></label><label>基准人数，可留空<input type="number" min="1" max="50" value={base} disabled={mutation.disabled} onChange={e=>setBase(e.target.value)}/></label>{invalid&&<Notice text={invalid} error/>}{mutation.feedback}{replacementConfirmation&&<div className="notice"><p>确认替换当前编辑的文本字段</p>{ingredientsEdited&&<p>修改原料文本将替换原料结构化数量、处理形态和部位；未修改的字段会完整保留。</p>}{stepsEdited&&<p>修改步骤文本将按每行一步重建，原多行步骤分组不再保留；未修改的字段会完整保留。</p>}<button disabled={mutation.disabled} onClick={()=>void save(true)}>确认替换已编辑的原料和步骤</button>{' '}<button disabled={mutation.saving} onClick={()=>setReplacementConfirmation(false)}>继续编辑原料和步骤</button></div>}<button disabled={mutation.disabled||replacementConfirmation} onClick={()=>void save()}>保存自定义菜谱</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消自定义编辑</button></Dialog>;
}
export function TemplateEditor({actions,template,snapshots,servings,onDone}:{actions:LocalActions;template?:MenuTemplate;snapshots?:RecipeSnapshot[];servings?:number;onDone:()=>void}){
  const mutation=useLocalMutation(actions),[name,setName]=useState(template?.name??''),[count,setCount]=useState(String(template?.servings??servings??2)),[selection,setSelection]=useState(()=>structuredClone(template?.snapshots??snapshots??[])),[invalid,setInvalid]=useState('');
  async function save(){const input={...(template?{id:template.id}:{}),name:name.trim(),servings:Number(count),snapshots:selection};if(!isMenuTemplateInput(input)){setInvalid('模板名称必填，请确认 1–50 人和至少一道菜');return;}if(await mutation.run({type:'saveTemplate',template:input,expectedObjectRevision:template?.revision??null},'菜单模板已保存'))onDone();}
  return <Dialog title={template?'更新菜单模板快照':'保存菜单模板'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>{template?'更新菜单模板快照':'保存菜单模板'}</h3><p>模板是可重复使用的组合，不是实际饮食。来源修改不会自动更新，手动替换后再确认保存新快照。</p><label>模板名称<input value={name} disabled={mutation.disabled} onChange={e=>setName(e.target.value)}/></label><label>模板默认人数<input type="number" min="1" max="50" value={count} disabled={mutation.disabled} onChange={e=>setCount(e.target.value)}/></label><SnapshotPicker selected={selection} onChange={setSelection} actions={actions} disabled={mutation.disabled} kind="模板"/>{invalid&&<Notice text={invalid} error/>}{mutation.feedback}<button disabled={mutation.disabled||!selection.length} onClick={()=>void save()}>确认保存模板</button>{' '}<button disabled={mutation.saving} onClick={onDone}>取消模板编辑</button></Dialog>;
}
export function ClearEditor({actions,onDone}:{actions:LocalActions;onDone:()=>void}){
  const mutation=useLocalMutation(actions),[stage,setStage]=useState(1);
  return <Dialog title={'清空本应用全部数据'} busy={mutation.saving||actions.pending} onClose={onDone}><h3>清空本应用全部数据</h3><p>将清空本应用的偏好、草稿、自定义菜谱、收藏、模板、计划、实际饮食、采购清单和回收站。其他同源应用数据不会清除。</p><p>请先在数据管理导出备份；清空后无法从回收站恢复。</p>{stage===1?<button disabled={mutation.disabled} onClick={()=>setStage(2)}>我已了解影响，继续</button>:<><p>第二次确认：我接受未备份的数据丢失风险。</p>{mutation.feedback}<button disabled={mutation.disabled} onClick={()=>void mutation.run({type:'clearAll'},'本应用个人数据已清空').then(ok=>{if(ok)onDone();})}>最终确认清空本应用</button></>}{' '}<button disabled={mutation.saving} onClick={onDone}>取消清空</button></Dialog>;
}
