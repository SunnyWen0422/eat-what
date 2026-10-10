import type { PersonalData, Result, TimeZone, UtcIso } from '../domain/types.ts';
import type { CommitReceipt, RawSnapshot, Repository } from '../data/repository.ts';
import { BACKUP_CONTEXT_LIMITS, BACKUP_FORMAT, exactKeys, isInteger, isText, isTimeZone, LIMITS, personalRecordCounts, validateJsonBoundary, validatePersonalData } from '../domain/validation.ts';
import { isUtcIso } from '../domain/dates.ts';
import { encodeRawSnapshot } from './raw.ts';
export interface BackupContext {appVersion:string;catalogVersion:string|null;exportedAt:UtcIso;timeZone:TimeZone}
export interface RestoreCandidate {data:PersonalData;context:BackupContext;counts:Record<string,number>;warnings:string[]}
const fail=<T>(code:'INVALID'|'LIMIT'|'UNAVAILABLE',message:string):Result<T>=>({ok:false,error:{code,message}});
const token=(value:unknown,max:number)=>isText(value)&&value.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:+/\-]*$/.test(value);
function validContext(value:unknown):value is BackupContext {
  return exactKeys(value,['appVersion','catalogVersion','exportedAt','timeZone'])&&token(value.appVersion,BACKUP_CONTEXT_LIMITS.appVersion)
    &&(value.catalogVersion===null||token(value.catalogVersion,BACKUP_CONTEXT_LIMITS.catalogVersion))&&isUtcIso(value.exportedAt)
    &&typeof value.timeZone==='string'&&value.timeZone.length<=BACKUP_CONTEXT_LIMITS.timeZone&&isTimeZone(value.timeZone);
}
/** Scans before JSON.parse; braces inside strings do not count. Rejects ambiguous duplicate object keys. */
export function scanJsonTextBoundary(text:string):Result<unknown>{
  const stack:{kind:string;keys:Set<string>}[]=[];
  try{
    for(let index=0;index<text.length;index++){
      const char=text[index]!;
      if(char==='"'){
        const start=index;let length=0,closed=false;
        while(++index<text.length){const current=text[index]!;
          if(current==='"'){closed=true;break;}
          if(current==='\\'){
            const escape=text[++index];if(escape==='u'){const hex=text.slice(index+1,index+5);if(!/^[0-9a-fA-F]{4}$/.test(hex))throw new TypeError('Invalid JSON string escape');index+=4;}
            else if(!escape||!'"\\/bfnrt'.includes(escape))throw new TypeError('Invalid JSON string escape');
          }else if(current.charCodeAt(0)<32)throw new TypeError('Invalid JSON string');
          if(++length>LIMITS.string)throw new RangeError('String exceeds 20,000 characters');
        }
        if(!closed)throw new TypeError('Unterminated JSON string');
        let next=index+1;while(next<text.length&&/\s/.test(text[next]!))next++;
        if(text[next]===':'&&stack.at(-1)?.kind==='{'){
          const key=JSON.parse(text.slice(start,index+1)) as string,keys=stack.at(-1)!.keys;
          if(['__proto__','prototype','constructor'].includes(key))throw new TypeError('Dangerous object key');
          if(keys.has(key))throw new TypeError('Duplicate object key');keys.add(key);
        }
      }else if(char==='{'||char==='['){stack.push({kind:char,keys:new Set()});if(stack.length>LIMITS.depth)throw new RangeError('JSON nesting exceeds 20 levels');}
      else if(char==='}'||char===']'){if(stack.pop()?.kind!==(char==='}'?'{':'['))throw new TypeError('Unbalanced JSON containers');}
    }
    if(stack.length)throw new TypeError('Unbalanced JSON containers');return {ok:true,value:null};
  }catch(error){return fail(error instanceof RangeError?'LIMIT':'INVALID',error instanceof Error?error.message:'Invalid JSON');}
}
function freeze<T>(value:T):T{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function warnings(data:PersonalData):string[]{
  const result:string[]=[],plans=new Set(data.plans.map(p=>p.id));
  const actuals=[...data.actualMeals,...data.trash.flatMap(t=>t.store==='actualMeals'?[t.data]:[])];
  if(actuals.some(a=>a.planId!==null&&!plans.has(a.planId)))result.push('来源计划已删除或不在备份中；实际饮食快照完整保留。');
  const lists=[...data.shoppingLists,...data.trash.flatMap(t=>t.store==='shoppingLists'?[t.data]:[])];
  if(lists.some(l=>l.sources.some(s=>s.kind==='plan'?!plans.has(s.id):data.draft===null)))result.push('部分采购来源已删除或不在备份中；采购来源快照和条目完整保留。');
  return result;
}
export function exportBackup(data:PersonalData,context:BackupContext):Result<Blob>{
  if(!validContext(context))return fail('INVALID','Invalid or overlong backup context');
  const validated=validatePersonalData(data);if(!validated.ok)return validated;
  const envelope={format:BACKUP_FORMAT,schemaVersion:1,...context,data:validated.value};
  const boundary=validateJsonBoundary(envelope);if(!boundary.ok)return boundary;
  try{return {ok:true,value:new Blob([JSON.stringify(envelope)],{type:'application/json;charset=utf-8'})};}
  catch{return fail('UNAVAILABLE','Backup could not be prepared; no download was requested');}
}
export async function parseBackup(file:Blob):Promise<Result<RestoreCandidate>>{
  if(!file||typeof file.size!=='number'||file.size>LIMITS.bytes)return fail('LIMIT','Backup file exceeds 20 MiB');
  try{
    const bytes=await file.arrayBuffer();if(bytes.byteLength>LIMITS.bytes)return fail('LIMIT','Backup file exceeds 20 MiB');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const scanned=scanJsonTextBoundary(text);if(!scanned.ok)return scanned;
    const value:unknown=JSON.parse(text);
    if(!exactKeys(value,['format','schemaVersion','appVersion','catalogVersion','exportedAt','timeZone','data'])||value.format!==BACKUP_FORMAT||value.schemaVersion!==1)return fail('INVALID','Only the eatwhat-web-backup v1 format can be restored; raw and newer formats are preservation-only');
    const context={appVersion:value.appVersion,catalogVersion:value.catalogVersion,exportedAt:value.exportedAt,timeZone:value.timeZone};
    if(!validContext(context))return fail('INVALID','Invalid or overlong backup context');
    const checked=validatePersonalData(value.data);if(!checked.ok)return checked;
    return {ok:true,value:freeze({data:checked.value,context:structuredClone(context),counts:personalRecordCounts(checked.value),warnings:warnings(checked.value)})};
  }catch{return fail('INVALID','Cannot read or parse this JSON backup; existing data is unchanged');}
}
/** Uses the validated immutable memory candidate. Never reads the original file again. */
export async function restoreBackup(repo:Repository,candidate:RestoreCandidate,expectedGlobalRevision:number,requestId:string):Promise<Result<CommitReceipt>>{
  if(!validContext(candidate?.context)||!isInteger(expectedGlobalRevision)||!isText(requestId))return fail('INVALID','Invalid restore candidate or request');
  const data=validatePersonalData(candidate.data);if(!data.ok)return data;
  return repo.commit({type:'replaceAll',data:data.value},expectedGlobalRevision,requestId);
}
export async function exportRawSnapshot(snapshot:RawSnapshot,context:{schemaVersion:number;appVersion:string;exportedAt:UtcIso}):Promise<Result<Blob>>{
  if(!isInteger(context.schemaVersion,1)||!token(context.appVersion,BACKUP_CONTEXT_LIMITS.appVersion)||!isUtcIso(context.exportedAt))return fail('INVALID','Invalid raw preservation context');
  try{const encoded=await encodeRawSnapshot(snapshot);return {ok:true,value:new Blob([JSON.stringify({format:'eatwhat-web-raw-snapshot',encoding:'eatwhat-structured-clone-v1',restorable:false,...context,...encoded})],{type:'application/json;charset=utf-8'})};}
  catch(error){return fail('UNAVAILABLE',`Raw preservation failed: ${error instanceof Error?error.message:'unsupported stored value'}. No partial backup was requested.`);}
}
export function backupFilename(context:Pick<BackupContext,'exportedAt'|'timeZone'>,raw=false):string{return `eatwhat-${raw?'raw-preservation':'backup'}-${context.exportedAt.replaceAll(':','-')}-${context.timeZone.replaceAll('/','_')}.json`;}
