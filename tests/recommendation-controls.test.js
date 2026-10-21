const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const criteria=require('../utils/recommendation-criteria')
function fixture(file){
 let scope='A',page,modal,sequence=0,reset=async()=>({}),toast=[]
 const data=new Map(),calls=[]
 const key=name=>scope+':'+name
 const wx={getStorageSync:key=>data.get(key),setStorageSync:(key,value)=>data.set(key,value),removeStorageSync:key=>data.delete(key),showModal:options=>{modal=options},showToast:value=>toast.push(value),navigateBack(){}}
 const modules={
  '../../utils/util':{getUserStorageKey:key},
  '../../utils/font-scale':Object.assign(()=>1,{base:16}),
  '../../utils/recommendation-criteria':criteria,
  '../../utils/preference-store':{defaultPreferences:()=>({}),normalizePreferences:v=>v},
  '../../utils/preference-save-presentation':{preferenceSaveIssue:()=>null},
  '../../utils/recommendation-options':{loadRecommendationOptions:async()=>({synced:true,options:{groups:{},recommendationPolicyVersion:'balanced-v1'}}),sanitizeCriteriaForOptions:v=>v},
  '../../utils/meal-workspace':{requestId:()=>`reset-${++sequence}`},
  '../../utils/api':{resetRecommendationLearning:async body=>{calls.push(body.requestId);return reset()}},
 }
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{wx,Page:value=>{page=value},require:name=>{if(!(name in modules))throw Error(name);return modules[name]},console})
 page.data={...page.data};page.setData=value=>Object.assign(page.data,value)
 return {page,data,key,calls,get modal(){return modal},toast,switchAccount(){scope='B'},setReset(fn){reset=fn}}
}
function settings(){const f=fixture('pages/settings/settings.js');f.page._scope=f.key('preferencesPage');Object.assign(f.page.data,{loading:false,learningResetEnabled:true});return f}
test('learning reset cancellation leaves all data and requests untouched',async()=>{
 const f=settings();f.data.set('A:saved-preferences',{excludedIngredients:['花生']});f.page.onClearLearning();await f.modal.success({confirm:false})
 assert.equal(f.calls.length,0);assert.equal(f.data.size,1);assert.match(f.modal.content,/手填偏好、收藏、日历和用餐记录都会保留/)
})
test('unknown learning reset retries the identical request and clears only its receipt after success',async()=>{
 const f=settings();f.setReset(async()=>{throw Error('unknown')});f.page.onClearLearning();await f.modal.success({confirm:true})
 assert.equal(f.calls.length,1);assert.ok(f.data.get(f.key('pendingLearningReset')));assert.match(f.page.data.statusText,/暂未确认/)
 f.setReset(async()=>({}));f.page.onClearLearning();await f.modal.success({confirm:true})
 assert.deepEqual(f.calls,['reset-1','reset-1']);assert.equal(f.data.has(f.key('pendingLearningReset')),false);assert.equal(f.page.data.statusText,'学习记录已清除')
})
test('account change during learning reset never changes the next account UI or receipt',async()=>{
 const f=settings();let resolve;f.setReset(()=>new Promise(done=>{resolve=done}));f.page.onClearLearning();const saving=f.modal.success({confirm:true});f.switchAccount();f.data.set(f.key('pendingLearningReset'),{requestId:'B-request'});resolve({});await saving
 assert.equal(f.toast.length,0);assert.equal(f.data.get(f.key('pendingLearningReset')).requestId,'B-request');assert.equal(f.data.get('A:pendingLearningReset').requestId,'reset-1')
})
test('current favorite scope and hard filters are visible and only staged on explicit clear',async()=>{
 const f=fixture('pages/recommend-filter/recommend-filter.js');f.data.set(f.key('editingRecommendationPolicy'),'balanced-v1');f.data.set(f.key('editingRecommendationScope'),'favorites');f.data.set(f.key('editingRecommendationRequired'),{cuisineCodes:['SICHUAN'],maxCookMinutes:20});
 await f.page.onLoad();assert.equal(f.page.data.candidateScope,'favorites');assert.match(f.page.data.requiredSummary,/川菜|20/);assert.equal(f.data.has(f.key('pendingRecommendationCriteria')),false)
 f.page.onClearCandidateScope();f.page.onClearRequired();assert.equal(f.page.data.candidateScope,'all');assert.equal(f.page.data.requiredSummary,'');assert.equal(f.data.has(f.key('pendingRecommendationScope')),false)
 f.page.onApply();assert.equal(f.data.get(f.key('pendingRecommendationScope')),'all');assert.equal(f.data.get(f.key('pendingRecommendationClearRequired')),true)
})
