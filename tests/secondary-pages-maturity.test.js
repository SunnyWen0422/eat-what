const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const prefs=require('../utils/preference-store')
function settings(){let page,owner='A',writes=0,fail=false
 const modules={'../../utils/util':{getUserStorageKey:k=>owner+':'+k},'../../utils/preference-store':{...prefs,createPreferenceStore:()=>page.store},'../../utils/recommendation-options':{loadRecommendationOptions:async()=>({options:{groups:{}}})},'../../utils/experience-preferences':()=>({get:()=>({reducedMotion:false}),readFailed:()=>false}),'../../utils/font-scale':Object.assign(()=>1,{base:16})}
 vm.runInNewContext(fs.readFileSync('pages/settings/settings.js','utf8'),{Page:v=>page=v,require:n=>modules[n],wx:{showToast(){}},console})
 page.data=structuredClone(page.data);page.setData=function(values){for(const [key,value]of Object.entries(values)){const bits=key.split('.');if(bits.length===2)this.data[bits[0]][bits[1]]=value;else this.data[key]=value}}
 page._scope='A:preferencesPage';page.data.loading=false;page.store={save:async value=>{writes++;if(fail)throw Error('private raw storage error');return {preferences:value,synced:true}}}
 return {page,writes:()=>writes,switch:()=>owner='B',fail:()=>fail=true}
}
test('invalid default people input stays visible and cannot silently save a fallback value',async()=>{
 const f=settings();f.page.onDefaultPeople({detail:{value:''}});assert.equal(f.page.data.peopleDraft,'');await f.page.onSave();assert.equal(f.writes(),0);assert.match(f.page.data.peopleError,/1 至 50/)
 f.page.onDefaultPeople({detail:{value:'4'}});await f.page.onSave();assert.equal(f.writes(),1);assert.equal(f.page.data.preferences.defaultPeople,4)
})
test('a failed local preference save leaves input editable and does not claim a stored draft',async()=>{
 const f=settings();f.page.onDefaultPeople({detail:{value:'3'}});f.fail();await f.page.onSave();assert.equal(f.page.data.saving,false);assert.equal(f.page.data.peopleDraft,'3');assert.match(f.page.data.statusText,/未保存/);assert.doesNotMatch(f.page.data.statusText,/private|raw|storage/)
})
test('saving or account changes block stale preference taps',()=>{
 const f=settings();f.page.data.saving=true;f.page.onDurationTap({currentTarget:{dataset:{value:20}}});assert.equal(f.page.data.preferences.maxCookMinutes,null)
 f.page.data.saving=false;f.switch();f.page.onDefaultPeople({detail:{value:5}});assert.equal(f.page.data.preferences.defaultPeople,2)
})
test('failed preference read stops loading and does not allow overwriting unread settings',async()=>{
 const f=settings();Object.assign(f.page.store,{migrateLegacy:async()=>{},load:async()=>{throw Error('unreadable local cache')}});await f.page.onLoad();assert.equal(f.page.data.loading,false);assert.equal(f.page.data.preferencesReadFailed,true);await f.page.onSave();assert.equal(f.writes(),0)
})
test('about states model and voice boundaries without promising automated medical or business success',()=>{
 const text=fs.readFileSync('pages/about/about.wxml','utf8');assert.match(text,/语音输入暂未开放/);assert.match(text,/模型服务/);assert.match(text,/必要的.*对话/);assert.doesNotMatch(text,/营养精准|自动下单|敬请期待/)
})
test('admin diagnostics are collapsed and copy remains an explicit action',()=>{
 const text=fs.readFileSync('pages/admin-audit/admin-audit.wxml','utf8');assert.match(text,/wx:if="\{\{item.detailsExpanded\}\}"/);assert.match(text,/bindtap="onCopyAudit"/);assert.match(text,/item.actionLabel/)
 for(const page of ['admin','admin-dashboard','admin-users','admin-user-detail','admin-dishes','admin-audit'])assert.match(fs.readFileSync('pages/'+page+'/'+page+'.wxml','utf8'),/fontBase \* fontScale/)
})
test('opening audit details only updates presentation and copy keeps the original request reference',()=>{
 let page,copy;vm.runInNewContext(fs.readFileSync('pages/admin-audit/admin-audit.js','utf8'),{Page:v=>page=v,wx:{setClipboardData:v=>copy=v.data},require:n=>n.includes('admin-page-identity')?{withAdminIdentity:d=>d}:n.includes('font-scale')?Object.assign(()=>1,{base:16}):{}})
 page.setData=v=>Object.assign(page.data,v);page.data.logs=[{id:1,requestId:'original',action:'CUSTOM_DISH_UPDATE',result:'SUCCESS',detail:'changedFields: name',detailsExpanded:false}];const e={currentTarget:{dataset:{id:1}}};page.onAuditDetails(e);assert.equal(page.data.logs[0].detailsExpanded,true);assert.equal(copy,undefined);page.onCopyAudit(e);assert.equal(JSON.parse(copy).requestId,'original')
})
