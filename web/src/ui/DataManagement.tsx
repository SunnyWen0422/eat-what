import { useRef, useState } from 'react';
import { backupFilename, exportBackup, exportRawSnapshot, parseBackup, restoreBackup, type BackupContext, type RestoreCandidate } from '../backup/backup.ts';
import { APP_VERSION } from '../data/migrations.ts';
import type { Command, Repository } from '../data/repository.ts';
import { requestDownload, type StorageStatus } from '../data/storage-status.ts';
import type { PersonalData, TimeZone, UtcIso } from '../domain/types.ts';
import { LIMITS, personalRecordCounts } from '../domain/validation.ts';
import { errorMessage, Notice } from './components.tsx';
import type { LocalActions } from './PersonalActions.tsx';
interface Preview {candidate:RestoreCandidate;revision:number;previous:PersonalData;requestId:string;blocked:boolean}
const labels:Record<string,string>={preferences:'设置与忌口',draft:'当前草稿',customRecipes:'自定义菜谱',favorites:'收藏',menuTemplates:'模板',plans:'计划',actualMeals:'实际记录',shoppingLists:'采购清单',trash:'回收站',total:'个人记录总数'};
export function DataManagement({actions,repository,memoryData,storageStatus,persisted,onPersistence,onClear,metadataKnown}:{actions:LocalActions;metadataKnown:boolean;repository:Repository|null;memoryData:PersonalData;storageStatus:StorageStatus;persisted:boolean|null;onPersistence:()=>void;onClear:()=>void}){
  const [preview,setPreview]=useState<Preview|null>(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[metadataMessage,setMetadataMessage]=useState(''),[error,setError]=useState(false),[downloadAt,setDownloadAt]=useState<string|null>(null);
  const working=useRef(false),selection=useRef(0),downloadRetry=useRef<{command:Extract<Command,{type:'markBackupRequested'}>;revision:number;id:string}|null>(null);
  const disabled=busy||actions.pending,counts=personalRecordCounts(actions.data);
  function context():BackupContext{return {appVersion:APP_VERSION,catalogVersion:actions.catalog?.ok?actions.catalog.value.version:null,exportedAt:new Date().toISOString() as UtcIso,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone};}
  async function metadata(revision:number,requestedAt:UtcIso){
    if(!actions.writable)return;
    const retry={command:{type:'markBackupRequested' as const,requestedAt},revision,id:crypto.randomUUID()};downloadRetry.current=retry;
    await writeDownloadTime(retry);
  }
  async function writeDownloadTime(retry:NonNullable<typeof downloadRetry.current>){
    const result=await actions.commit(retry.command,retry.revision,retry.id);
    if(result.ok){downloadRetry.current=null;setMetadataMessage('下载请求时间已记录；这不证明文件已保存。');setPreview(p=>p?{...p,blocked:true}:null);setAccepted(false);}
    else setMetadataMessage('已请求下载，但下载时间未写入本地记录。'+errorMessage(result.error.code));
  }
  async function download(kind:'saved'|'memory'|'previous'|'raw'){
    if(working.current||actions.pending)return;working.current=true;setBusy(true);setError(false);
    try{
      const ctx=context();let revision=actions.data.meta.revision;
      if(kind==='raw'){
        if(!repository){setError(true);setMessage('没有可读取的原始数据库。当前内存仍可单独导出。');return;}
        const raw=await repository.readRawSnapshot();if(!raw.ok){setError(true);setMessage(errorMessage(raw.error.code));return;}
        const result=await exportRawSnapshot(raw.value,{schemaVersion:raw.value.version,appVersion:APP_VERSION,exportedAt:ctx.exportedAt});if(!result.ok){setError(true);setMessage(result.error.message);return;}
        const requested=requestDownload(result.value,backupFilename(ctx,true));if(!requested.ok){setError(true);setMessage(requested.error.message);return;}
        setMessage('已请求下载原始保留文件。此格式仅供留存，本版不能恢复。');setDownloadAt(ctx.exportedAt);return;
      }
      let data=memoryData;
      if(kind==='saved'){const latest=await actions.readLatest();if(!latest.ok){setError(true);setMessage('个人结构无法读取：'+errorMessage(latest.error.code)+' 可导出原始保留文件或当前内存。');return;}data=latest.value;revision=data.meta.revision;}
      if(kind==='previous'){if(!preview)return;data=preview.previous;revision=preview.revision;}
      const exported=exportBackup(data,ctx);if(!exported.ok){setError(true);setMessage(exported.error.message+' 数据没有截断，可尝试完整原始保留文件。');return;}
      const requested=requestDownload(exported.value,backupFilename(ctx));if(!requested.ok){setError(true);setMessage(requested.error.message);return;}
      setDownloadAt(ctx.exportedAt);setMessage(kind==='memory'?'已请求下载当前内存备份，含未保存编辑。请自行确认文件已保存。':kind==='previous'?'已请求下载恢复前旧库备份。请自行确认文件已保存。':'已请求下载个人备份。请自行确认文件已保存。');
      await metadata(revision,ctx.exportedAt);
    }catch{setError(true);setMessage('备份操作未完成，请保留当前内容后重试。');}
    finally{working.current=false;setBusy(false);}
  }
  async function select(file:File|undefined){
    if(!file||working.current||actions.pending)return;const token=++selection.current;working.current=true;setBusy(true);setPreview(null);setAccepted(false);setError(false);setMessage('正在验证备份…');
    try{const parsed=await parseBackup(file);if(token!==selection.current)return;if(!parsed.ok){setError(true);setMessage(parsed.error.message);return;}await repreview(parsed.value);}
    finally{working.current=false;setBusy(false);}
  }
  async function repreview(candidate:RestoreCandidate){
    const latest=await actions.readLatest();if(!latest.ok){setError(true);setMessage(errorMessage(latest.error.code));return;}
    setPreview({candidate,revision:latest.value.meta.revision,previous:latest.value,requestId:crypto.randomUUID(),blocked:false});setAccepted(false);setError(false);setMessage('备份已验证，尚未替换任何数据。');
  }
  async function review(){if(!preview||working.current||actions.pending)return;working.current=true;setBusy(true);try{await repreview(preview.candidate);}finally{working.current=false;setBusy(false);}}
  async function restore(){
    if(!preview||!accepted||preview.blocked||!repository||working.current||actions.pending||!actions.writable)return;working.current=true;setBusy(true);setError(false);
    try{const result=await restoreBackup({...repository,commit:actions.commit},preview.candidate,preview.revision,preview.requestId);
      if(result.ok){setMessage(result.value.replayed?'这次恢复请求已执行，之后新增的内容仍保留。':'个人备份已恢复。');setPreview(null);setAccepted(false);}
      else{setError(true);if(result.error.code==='CONFLICT'){setPreview({...preview,blocked:true});setAccepted(false);setMessage('预览后数据有更新，未覆盖。请重新预览这份已验证备份并重新确认。');}else setMessage(errorMessage(result.error.code));}
    }catch{setError(true);setMessage('恢复结果尚未确认，请保留此预览并用原请求重试。');}
    finally{working.current=false;setBusy(false);}
  }
  const previousCounts=preview?personalRecordCounts(preview.previous):null;
  return <section className="card" aria-labelledby="data-title"><h3 id="data-title">数据管理</h3><p className="origin">当前数据空间：{storageStatus.origin}</p><p>可读：{storageStatus.readable?'是':'否'} · 可写：{actions.writable?'是':'否'}</p><p>最后成功写入：{metadataKnown?(actions.data.meta.lastSuccessfulWriteAt??'尚未写入'):'未知'}</p><p>最近请求下载备份：{metadataKnown?(actions.data.meta.lastBackupRequestedAt??'尚未请求'):'未知'}</p>{downloadAt&&<p>本页最近请求下载：{downloadAt}</p>}<p>估算占用：{storageStatus.estimate?.usage??'未知'} · 配额：{storageStatus.estimate?.quota??'未知'} 字节</p><p>持久化许可：{persisted===null?'未知':persisted?'已获得':'未获得'}</p>
    <p>备份包含饮食记录和忌口等个人隐私。只在本地处理，不上传网络。请妥善保存并谨慎分享文件。</p><p>浏览器清理数据后可能丢失。下载按钮只请求下载，不能确认文件是否已保存。</p><p>当前内存备份保留当前草稿和设置；其他尚未提交的表单输入请另行保留。</p><p>普通 v1 备份含全部个人记录、采购与回收站和引用菜品快照，不含在线完整菜库。原始保留文件不会截断数据，仅供留存，本版不能恢复。</p>
    {counts.total!>=19_000&&<Notice text={`个人记录已达 ${counts.total} 条，接近 ${LIMITS.records} 条上限。请导出备份，保存失败不会自动删除记录。`}/>}
    <button disabled={disabled||repository===null} onClick={()=>void download('saved')}>导出已保存个人备份</button>{' '}<button disabled={disabled} onClick={()=>void download('memory')}>导出当前内存备份</button>{' '}<button disabled={disabled||repository===null} onClick={()=>void download('raw')}>导出原始保留文件</button>
    {message&&<Notice text={message} error={error}/>} {metadataMessage&&<p>{metadataMessage}</p>}{downloadRetry.current&&<button disabled={disabled||!actions.writable} onClick={()=>{const retry=downloadRetry.current;if(!retry)return;working.current=true;setBusy(true);void writeDownloadTime(retry).finally(()=>{working.current=false;setBusy(false);});}}>重试记录下载时间</button>}
    <label>选择 JSON 备份<input type="file" accept="application/json,.json" disabled={disabled||!actions.writable} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void select(file);}}/></label>
    {preview&&<div className="notice"><h4>恢复预览</h4><p>备份导出时间：{preview.candidate.context.exportedAt} · 时区：{preview.candidate.context.timeZone}</p><p>应用版本：{preview.candidate.context.appVersion} · 在线菜库版本：{preview.candidate.context.catalogVersion??'未知'}</p><p>本地预览版本：{preview.revision}</p><p>将替换当前全部个人记录、回收站、草稿和设置；当前未保存草稿也会被替换。此操作无法从回收站撤回。</p><ul>{Object.entries(preview.candidate.counts).map(([key,count])=><li key={key}>{labels[key]}：当前 {previousCounts?.[key]??0} → 备份 {count}</li>)}</ul>{preview.candidate.warnings.map((warning,n)=><p key={n}>{warning}</p>)}
      <button disabled={disabled} onClick={()=>void download('previous')}>导出恢复前旧库备份</button>
      {preview.blocked&&<p>预览后本地版本有变化。记录下载请求时间也会改变版本，请重新预览当前替换影响。使用的是同一份已验证内存备份，不会重新读取文件。</p>}
      <button disabled={disabled} onClick={()=>void review()}>重新预览已验证备份</button>
      <label><input type="checkbox" checked={accepted} disabled={disabled||preview.blocked} onChange={e=>setAccepted(e.target.checked)}/>我已保存旧库备份，或接受覆盖且无法撤回</label>
      <button disabled={disabled||!actions.writable||!accepted||preview.blocked} onClick={()=>void restore()}>确认替换全部个人数据</button>{' '}<button disabled={disabled} onClick={()=>{selection.current++;setPreview(null);setAccepted(false);setMessage('已取消恢复，原数据未替换。');}}>取消备份恢复</button>
    </div>}
    <button disabled={disabled} onClick={onPersistence}>请求持久化存储</button><p>未获得持久化许可仍可继续使用，浏览器仍可能清理本地数据。</p><p>清空只作用于本应用，并且不能从回收站恢复。</p><button disabled={disabled||!actions.writable} onClick={onClear}>清空本应用全部数据</button>
  </section>;
}
