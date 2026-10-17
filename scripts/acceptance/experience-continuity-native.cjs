// E18: screenshots/fixture state never stand in for lifecycle or physical proof.
'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),net=require('node:net')
const ROOT=path.resolve(__dirname,'../..'), sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')), write=(p,v)=>fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const bounded=(promise,ms=25000)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Native operation timed out; remaining items not-run')),ms);promise.then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)})})
function options(argv) {
 const value=name=>{const i=argv.indexOf('--'+name);return i<0?undefined:argv[i+1]}
 const mode=value('mode');if(!['fixture','service'].includes(mode))throw Error('Explicit --mode fixture|service required')
 if(!value('out'))throw Error('--out required')
 if(mode==='service'&&!value('config'))throw Error('Service mode requires --config for NEW owned runtime')
 if(mode!=='service'&&(argv.includes('--remote')||argv.includes('--assistant-cards')))throw Error('Remote entry and actual assistant cards require owned service mode')
 const scales=(value('scales')||'1,1.3,2').split(',').map(Number)
 if(scales.some(s=>![1,1.3,2].includes(s)))throw Error('Only approved font scales 1/1.3/2')
 const width=Number(value('width')||390),widths=(value('widths')||String(width)).split(',').map(Number),port=Number(value('port')||9431)
 if(widths.some(w=>![320,390,430].includes(w))||!Number.isInteger(port)||port<1024||[9420,9427,18780,18781].includes(port))throw Error('Explicit safe automation port and 320/390/430 width required')
 return {mode,out:path.resolve(value('out')),config:value('config'),session:value('session'),python:value('python')||process.env.CODEX_PYTHON,node:process.execPath,
  sdk:value('sdk')||process.env.EATWHAT_NATIVE_SDK,cli:value('cli')||process.env.EATWHAT_WECHAT_CLI,port,width,widths,scales,cases:value('cases')?.split(','),prepare:argv.includes('--prepare-only'),remote:argv.includes('--remote'),manualConfirm:argv.includes('--manual-confirm'),assistantCards:argv.includes('--assistant-cards')}
}
function matrix(routes) {
 const local=new Set(['about']), dirty=new Set(['index','result','customize','custom-dishes','profile-edit','recommend-filter','settings','chat','shopping-preview','shopping-list','calendar-detail','meal-cooking','admin','admin-dishes'])
 const writeRoutes=new Set(['index','result','customize','custom-dishes','profile-edit','settings','chat','shopping-preview','shopping-list','calendar-detail','meal-cooking','admin','admin-dishes','admin-users','admin-user-detail','admin-audit'])
 const rows=[]
 for(const route of routes)for(const role of route.includes('/admin')?['admin','ordinary']:['ordinary']) {
  const name=route.split('/')[1],states={}
  for(const state of ['normal','loading','empty','fail','permission','completed','dirty','unknown']) {
   let reason='Requires native render and semantic inspection; no screenshot-count pass'
   if(local.has(name)&&['loading','empty','fail','permission','completed','unknown'].includes(state))reason='not-applicable: local static/help or local log display has no service transaction state'
   if(state==='dirty'&&!dirty.has(name))reason='not-applicable: route has no editable draft or unsaved form'
   if(['completed','unknown'].includes(state)&&!writeRoutes.has(name))reason='not-applicable: read/navigation route has no persistent write receipt'
   if(name==='logs'&&['loading','fail','permission','unknown'].includes(state))reason='not-applicable: local log display has no corresponding asynchronous/authenticated transaction UI'
   if(name==='logs'&&['empty','completed'].includes(state))reason='Local empty display and confirmation-based clear are applicable; native observation not yet run'
   if(role==='ordinary'&&route.includes('/admin')&&state!=='permission')reason='not-applicable: ordinary identity must remain outside administrative private content'
   states[state]={status:reason.startsWith('not-applicable')?'not-applicable':'not-run',reason,evidence:[]}
  }
  rows.push({route,role,states})
 }
 return rows
}
function guardSource({mode,runId,api,fontScale=1}) {
 return `// Export-only boundary; never used by canonical app.\nconst state=${JSON.stringify({mode,runId,api,lifecycleEnabled:mode==='service',label:'E18 '+mode+' · 合成账号',denied:{},storage:{},lifecycle:[],requests:[],fontScale,readDelayMs:0})};
const deny=name=>function(o={}){state.denied[name]=(state.denied[name]||0)+1;const e={errMsg:name+':fail E18_BOUNDARY_BLOCKED'};Promise.resolve().then(()=>{if(o.fail)o.fail(e);if(o.complete)o.complete(e)});return {abort(){},close(){},onOpen(){},onMessage(){},onError(){},onClose(){},onHeadersReceived(){},onChunkReceived(){}}};
const install=(target,name,fn)=>{target[name]=fn;if(target[name]!==fn)throw Error('E18_GUARD_INSTALL_FAILED:'+name)};
const request=wx.request;install(wx,'request',function(o={}){const allowed=state.lifecycleEnabled&&typeof o.url==='string'&&(o.url===state.api||o.url.indexOf(state.api+'/')===0);if(!allowed)return deny('request')(o);const route=o.url.slice(state.api.length).split('?')[0],method=o.method||'GET';state.requests.push({path:route,method});const delay=route==='/dishes'&&method==='GET'?Math.min(1000,Math.max(0,Number(state.readDelayMs)||0)):0;if(!delay)return request.call(wx,o);const wrapped=Object.assign({},o);for(const key of ['success','fail','complete'])if(typeof o[key]==='function')wrapped[key]=value=>setTimeout(()=>o[key](value),delay);return request.call(wx,wrapped)});
for(const name of ['login','checkSession','uploadFile','downloadFile','connectSocket','sendSocketMessage','getUserInfo','getUserProfile','getPhoneNumber','requestPayment','openEmbeddedMiniProgram','navigateToMiniProgram','openOfficialAccountArticle','createLivePusherContext'])install(wx,name,deny(name));
if(wx.cloud)for(const name of ['init','callFunction','uploadFile','downloadFile','getTempFileURL','connectContainer','callContainer','database'])install(wx.cloud,name,deny('cloud.'+name));
const memory={getStorageSync:k=>state.storage[k]==null?'':state.storage[k],setStorageSync:(k,v)=>{state.storage[k]=v},removeStorageSync:k=>{delete state.storage[k]},clearStorageSync:()=>{state.storage={}},getStorageInfoSync:()=>({keys:Object.keys(state.storage),currentSize:0,limitSize:10240})};for(const name of Object.keys(memory))install(wx,name,memory[name]);
for(const name of ['getStorage','setStorage','removeStorage','clearStorage','getStorageInfo'])install(wx,name,function(o={}){let r={errMsg:name+':ok'};if(name==='getStorage')r.data=wx.getStorageSync(o.key);if(name==='setStorage')wx.setStorageSync(o.key,o.data);if(name==='removeStorage')wx.removeStorageSync(o.key);if(name==='clearStorage')wx.clearStorageSync();if(name==='getStorageInfo')Object.assign(r,wx.getStorageInfoSync());Promise.resolve().then(()=>{if(o.success)o.success(r);if(o.complete)o.complete(r)})});
const base=wx.getAppBaseInfo;install(wx,'getAppBaseInfo',function(){return Object.assign({},base?base.call(wx):{},{fontSizeScaleFactor:state.fontScale})});
const originalPage=Page;Page=function(def){for(const name of ['onLoad','onShow','onReady','onHide','onUnload'])if(typeof def[name]==='function'||name==='onLoad'){const fn=def[name];def[name]=function(...args){state.lifecycle.push({route:this.route,name});if(state.lifecycleEnabled){if(fn)return fn.apply(this,args)}}}return originalPage(def)};module.exports=state;\n`
}
function assess({measurements,errors=[]}) {
 if(!measurements.length)return {status:'blocked',reason:'No measurable native content; no layout conclusion'}
 const violations=measurements.filter(r=>r.clipped&&!r.scrollContained||(r.hit&&(r.width<43.5||r.height<(r.primary?47.5:43.5))))
 return {status:violations.length||errors.length?'failed':'measured',violations,errors,reason:'Geometry only; clipping, overlap, text reachability and reader still require inspection'}
}
function outside(p) {
 const r=path.resolve(p),normalize=v=>process.platform==='win32'?path.resolve(v).replace(/^\\\\\?\\/,'').toLowerCase():path.resolve(v)
 const root=normalize(fs.realpathSync(ROOT)),within=v=>{v=normalize(v);return v===root||v.startsWith(root+path.sep)}
 if(within(r))throw Error('Canonical repository/output forbidden')
 // Resolve the nearest existing ancestor before mkdir, including junctions.
 let ancestor=r;const tail=[]
 while(!fs.existsSync(ancestor)){
  try{fs.lstatSync(ancestor);throw Error('Unresolvable output link forbidden')}catch(e){if(e.code!=='ENOENT')throw e}
  const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Unresolvable output ancestor')
  tail.unshift(path.basename(ancestor));ancestor=parent
 }
 if(within(path.join(fs.realpathSync(ancestor),...tail)))throw Error('Canonical repository/output forbidden through ancestor')
 return r
}
function fingerprint(project) {
 const files=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Export symlink forbidden');if(item.isDirectory())walk(p);else files.push([path.relative(project,p).replaceAll('\\','/'),sha(p)])}}walk(project)
 return crypto.createHash('sha256').update(files.sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x.join(':')+'\n').join('')).digest('hex')
}
function validate(project,manifest) {
 project=fs.realpathSync(outside(project));if(manifest.project!==project||manifest.mode!==read(path.join(project,'e18-manifest.json')).mode)throw Error('Export manifest identity mismatch')
 for(const item of manifest.files)if(sha(path.join(project,item.path))!==item.sha256)throw Error('Export bytes changed: '+item.path)
 const cfg=fs.readFileSync(path.join(project,'utils/config.js'),'utf8')
 if(!cfg.includes(manifest.api)||cfg.includes('https://chishenme.icu/api'))throw Error('Canonical API leaked into export')
 return project
}
function prepare(o,session) {
 outside(o.out);if(fs.existsSync(o.out))throw Error('Choose a fresh evidence directory')
 fs.mkdirSync(o.out,{recursive:true});const project=path.join(o.out,'project')
 const exported=cp.spawnSync(o.python,[path.join(ROOT,'scripts/export_local_miniprogram.py'),'--out',project],{encoding:'utf8',windowsHide:true})
 if(exported.status!==0)throw Error('Export failed: '+exported.stderr)
 const source=read(path.join(project,'source-manifest.json')),api=o.mode==='service'?session.api:'http://127.0.0.1:9/api',runId=path.basename(o.out)+'-'+crypto.createHash('sha256').update(o.out).digest('hex').slice(0,12)
 const sourceSha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()
 if(o.mode==='service'&&o.scales.length!==1)throw Error('Each service export must use one cold font factor; coordinator splits scales')
 write(path.join(project,'native-guard.js'),guardSource({mode:o.mode,runId,api,fontScale:o.scales[0]}))
 let app=fs.readFileSync(path.join(project,'app.js'),'utf8')
 app="const e18=require('./native-guard');\n"+app.replace('App({','App({\n nativeAcceptance:e18,')
 if(o.mode==='fixture')app="const e18=require('./native-guard');App({nativeAcceptance:e18,globalData:{userInfo:null,loginReady:true,isLoggedIn:false},waitForLogin(){return Promise.resolve()}})"
 write(path.join(project,'app.js'),app)
 write(path.join(project,'utils/config.js'),fs.readFileSync(path.join(project,'utils/config.js'),'utf8').replace('https://chishenme.icu/api',api))
 const config=read(path.join(project,'project.config.json'));config.projectname='E18-'+o.mode+'-'+runId;config.appid=o.mode==='fixture'?'touristappid':config.appid;write(path.join(project,'project.config.json'),config)
 const appConfig=read(path.join(project,'app.json'));appConfig.window.navigationBarTitleText='E18 '+o.mode+' 合成验收';write(path.join(project,'app.json'),appConfig)
 if(o.remote)for(const route of appConfig.pages){const file=path.join(project,route+'.json');const pageConfig=read(file);pageConfig.navigationBarTitleText='合成验收·助手替身';write(file,pageConfig)}
 // Recursive exporter includes every component; assert the dependency previously missed.
 for(const ext of ['js','json','wxml','wxss'])if(!fs.existsSync(path.join(project,'components/ui-icon/ui-icon.'+ext)))throw Error('Missing recursive component: ui-icon.'+ext)
 const manifest={mode:o.mode,runId,project,api,sourceSha,sourceManifestSha256:sha(path.join(project,'source-manifest.json')),source,files:[],lifecycleEnabled:o.mode==='service',authentication:o.mode==='service'?'local-v4 synthetic login and signed test identities; NOT original WeChat SSO':'none; synthetic layout only'}
 const initial=source.files.map(x=>x.path).concat('native-guard.js');manifest.files=initial.map(p=>({path:p,sha256:sha(path.join(project,p))}))
 write(path.join(project,'e18-manifest.json'),{mode:o.mode,runId});manifest.appFingerprint=fingerprint(project);write(path.join(o.out,'export-manifest.json'),manifest)
 return manifest
}
async function portAvailable(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('Automation port occupied; no existing endpoint adopted')));server.listen(port,'127.0.0.1',()=>server.close(resolve))})}
async function launch(o,manifest) {
 validate(manifest.project,manifest);await portAvailable(o.port)
 if(!o.sdk||!o.cli||!fs.existsSync(o.sdk)||!fs.existsSync(o.cli))throw Error('Provide installed --sdk and official --cli paths; no dependency installation')
 const quote=v=>"'"+v.replaceAll("'","''")+"'"
 const child=cp.spawn('powershell.exe',['-NoProfile','-Command','& '+quote(o.cli)+' auto --project '+quote(manifest.project)+' --auto-port '+o.port+' --trust-project'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
 const chunks=[];child.stdout.on('data',b=>chunks.push(String(b)));child.stderr.on('data',b=>chunks.push(String(b)));child.once('error',e=>chunks.push(e.message))
 let mini;const deadline=Date.now()+55000,sdk=require(path.resolve(o.sdk))
 try {while(!mini&&Date.now()<deadline){try{mini=await bounded(sdk.connect({wsEndpoint:'ws://127.0.0.1:'+o.port}),5000)}catch(_){await sleep(1000)}}}finally{write(path.join(o.out,'cli.log'),chunks.join(''));if(child.exitCode===null)child.kill()}
 if(!mini)throw Error('Official CLI/automation unavailable after bounded launch; no alternate port/project adopted')
 // Tool socket is ready before the first app frame has loaded on a new export.
 await sleep(5000)
 let id
 try{id=await bounded(mini.evaluate(()=>({runId:getApp().nativeAcceptance?.runId,mode:getApp().nativeAcceptance?.mode})))}
 catch(error){
  // On a cold export, the Tool socket can predate the automation app context.
  // Reconnect once to this exact newly launched endpoint, never another project.
  mini.disconnect();await sleep(5000);mini=await bounded(sdk.connect({wsEndpoint:'ws://127.0.0.1:'+o.port}))
  id=await bounded(mini.evaluate(()=>({runId:getApp().nativeAcceptance?.runId,mode:getApp().nativeAcceptance?.mode})))
 }
 if(id.runId!==manifest.runId||id.mode!==o.mode){mini.disconnect();throw Error('Connected native app identity mismatch')}
 return mini
}
async function geometry(mini,page,width) {
 const selectors=['.ew-page','.ew-heading','.ew-title','.cooking-step','#cooking-step-heading','.dish-switch-scroll','.ew-tabs','.ew-link','.cooking-bottom','.action-bar','.detail-bottom','.preview-bottom','.mobile-scroll-content','.workspace-primary-control','.apply-btn','.ew-hit-target','button','input','textarea',
  'ui-button >>> .button','ui-button >>> .button.primary','ui-sheet >>> .ew-sheet','ui-sheet >>> .sheet-body','ui-sheet >>> .sheet-footer','ui-card >>> #cooking-step-heading','ui-card >>> .cooking-step','compact-dish-row >>> .dish-row','compact-dish-row >>> .dish-main','compact-dish-row >>> .dish-replace','compact-dish-row >>> .dish-more','compact-ingredient-row >>> .ingredient-row','compact-ingredient-row >>> .ingredient-check','compact-ingredient-row >>> .ingredient-quantity','compact-ingredient-row >>> .ingredient-sources','ui-chip >>> .ew-hit-target','ui-icon-button >>> .ew-hit-target']
 const groups=await bounded(mini.evaluate((selectors)=>new Promise(resolve=>{const q=wx.createSelectorQuery();for(const s of selectors)q.selectAll(s).boundingClientRect();q.exec(resolve)}),selectors))
 const measurements=[]
 for(let i=0;i<selectors.length;i++)for(const r of groups[i]||[])if(r.width>0&&r.height>0){const selector=selectors[i],primary=selector==='ui-button >>> .button.primary'||['.workspace-primary-control','.apply-btn'].includes(selector),hit=primary||/button|input|textarea|hit-target|dish-main|dish-replace|dish-more|ingredient-check|ingredient-quantity|ingredient-sources/.test(selector);measurements.push({...r,selector,hit,primary,clipped:r.left<-.5||r.right>width+.5})}
 // Native selector queries do not consistently pierce isolated components.
 // Keep the SDK's component-scoped hit rectangles, batch independent reads.
 const specs={'ui-button':['.button'], 'compact-dish-row':['.dish-main','.dish-replace','.dish-more'], 'compact-ingredient-row':['.ingredient-check','.ingredient-quantity','.ingredient-sources'], 'ui-icon-button':['.ew-hit-target'], 'ui-chip':['.ew-hit-target'], 'ui-sheet':['.ew-sheet','.sheet-body','.sheet-footer']}
 const errors=[],sets=await Promise.all(Object.keys(specs).map(async tag=>({tag,hosts:await bounded(page.$$(tag))})))
 const queries=sets.flatMap(({tag,hosts})=>hosts.slice(0,20).flatMap(host=>specs[tag].map(async selector=>({selector:tag+' '+selector,elements:await bounded(host.$$(selector)),hit:tag!=='ui-sheet',primary:tag==='ui-button'&&(await bounded(host.data('variant')))==='primary'}))))
 const found=await Promise.allSettled(queries)
 const boxes=found.flatMap(row=>row.status==='fulfilled'?row.value.elements.map(async element=>{const [size,offset]=await Promise.all([bounded(element.size()),bounded(element.offset())]);return {...size,...offset,selector:row.value.selector,hit:row.value.hit,primary:row.value.primary}}):[])
 for(const row of found)if(row.status==='rejected')errors.push(String(row.reason.message).slice(0,200))
 for(const row of await Promise.allSettled(boxes))if(row.status==='fulfilled'){const r=row.value;if(r.width>0&&r.height>0)measurements.push({...r,right:r.left+r.width,clipped:r.left<-.5||r.left+r.width>width+.5})}else errors.push(String(row.reason.message).slice(0,200))
 const category=await bounded(page.$('.category-scroll'))
 let horizontalCategory=null
 if(category){const [size,offset,scrollWidth]=await Promise.all([bounded(category.size()),bounded(category.offset()),bounded(category.scrollWidth())]);horizontalCategory={...size,...offset,scrollWidth};if(scrollWidth>size.width)for(const r of measurements)if(r.id?.startsWith('category-')&&r.top>=offset.top-1&&r.top+r.height<=offset.top+size.height+1)r.scrollContained=true}
 return {measurements,errors,horizontalCategory}
}
async function fontStyles(page,scale) {
 const fontBase=await bounded(page.data('fontBase')),styles=[]
 const selectors=['.ew-page','.connected-assistant','.container','.ew-heading','.cooking-step','.ew-hit-target','.workspace-requirements-entry','.requirements-label','.requirements-summary','.connected-messages','.connected-welcome','.connected-welcome .ew-title','.connected-input-row','.connected-input']
 await Promise.all(selectors.map(async selector=>{
  const element=await bounded(page.$(selector));if(!element)return
  const [fontSize,lineHeight,size,offset,padding,width,boxSizing]=await Promise.all([bounded(element.style('font-size')),bounded(element.style('line-height')),bounded(element.size()),bounded(element.offset()),bounded(element.style('padding')),bounded(element.style('width')),bounded(element.style('box-sizing'))])
  styles.push({selector,fontSize,lineHeight,...size,...offset,padding,computedWidth:width,boxSizing})
 }))
 const root=styles.find(s=>['.ew-page','.connected-assistant','.container'].includes(s.selector))
 return {fontBase,requestedScale:scale,styles,rootMatches:root&&Number.isFinite(fontBase)?Math.abs(parseFloat(root.fontSize)-fontBase*scale)<.5:null,scope:'Actual native computed styles via official SDK; export font adapter, not OS font responsiveness'}
}
async function actualViewport(mini) {
 return bounded(mini.evaluate(()=>new Promise(resolve=>{
  const plain=value=>JSON.parse(JSON.stringify(value)),systemInfo=plain(wx.getSystemInfoSync()),windowInfo=wx.getWindowInfo?plain(wx.getWindowInfo()):null
  const q=wx.createSelectorQuery();q.selectViewport().fields({size:true});q.exec(values=>{const viewportRect=plain(values[0]);resolve({
   ...systemInfo,...windowInfo,windowWidth:viewportRect.width,windowHeight:viewportRect.height,
   viewportRect,systemInfo,windowInfo,windowMatches:!!windowInfo&&windowInfo.windowWidth===viewportRect.width&&windowInfo.windowHeight===viewportRect.height,
   source:'Actual native viewport size; raw system/window info retained separately'
  })})
 })))
}
async function capture(o,manifest,session) {
 const report={mode:o.mode,lifecycleEnabled:o.mode==='service',sourceSha:manifest.sourceSha,appFingerprint:manifest.appFingerprint,authentication:manifest.authentication,requestedViewport:{width:o.width,widths:o.widths},actualViewport:null,fontScale:o.scales,device:null,evidence:[],matrix:matrix(read(path.join(manifest.project,'app.json')).pages),cases:[],exceptions:[],status:'not-run',physical:{android:'not-run',ios:'blocked: no iOS device available'},limits:['Measurements are not a complete layout/reader verdict','Font scale is fixed by export-only base-info before cold module loading; no per-page data override; original lifecycle executes; this does NOT prove product response to OS font changes or reader','No production/upload/release; original WeChat SSO unverified']}
 const save=()=>write(path.join(o.out,'native-results.json'),report);save()
 let mini
 try {
  mini=await launch(o,manifest)
  mini.on('exception',e=>{report.exceptions.push(String(e.message||e).slice(0,800));save()})
  report.actualViewport=await bounded(mini.systemInfo());report.device={kind:'WeChat developer-tools simulator',model:report.actualViewport.model,platform:report.actualViewport.platform,SDKVersion:report.actualViewport.SDKVersion};report.widthMatched=report.actualViewport.windowWidth===o.width;save()
  if(o.mode==='service')await bounded(mini.evaluate(()=>getApp().waitForLogin()))
  if(o.remote){
   const connected=new Promise(r=>mini.connection.once('Tool.onRemoteDebugConnected',r))
   const qr=await bounded(mini.send('Tool.enableRemoteDebug',{auto:false}),55000)
   if(!qr.qrCode)throw Error('Official remote debug returned no QR; device entry blocked')
   const data=qr.qrCode.replace(/^data:image\/\w+;base64,/,''),file=path.join(o.out,'android-remote-qr.png');fs.writeFileSync(file,Buffer.from(data,'base64'))
   report.remote={status:'awaiting-device',qr:file,providerMode:'mock',network:'NOT VERIFIED: phone loopback must never be assumed PC loopback'};save();console.log(JSON.stringify(report.remote))
   await bounded(connected,180000);await sleep(1000)
   report.remote.status='connected';report.remote.actualDevice=await bounded(mini.systemInfo());save()
   if(report.remote.actualDevice.platform!=='android')throw Error('Connected remote is not an observed Android device')
   report.remote.serviceRead=await bounded(mini.evaluate((account,expected)=>new Promise(resolve=>{
    const app=getApp(),guard=app.nativeAcceptance;if(!guard||guard.runId!==expected)return resolve({identityMatched:false})
    wx.setStorageSync('apiEnvironment',guard.api);wx.setStorageSync('token',account.token);wx.setStorageSync('userInfo',account.user);Object.assign(app.globalData,{userInfo:account.user,isLoggedIn:true,loginReady:true})
    wx.request({url:guard.api+'/users/info',header:{Authorization:'Bearer '+account.token},timeout:10000,success:r=>resolve({identityMatched:true,statusCode:r.statusCode,userId:r.data&&r.data.user&&r.data.user.id}),fail:e=>resolve({identityMatched:true,error:String(e.errMsg).slice(0,200)})})
   }),session.accounts.ordinary,manifest.runId),15000);save()
   if(report.remote.serviceRead.statusCode!==200||report.remote.serviceRead.userId!==session.accounts.ordinary.user.id)throw Error('Android reached tool but owned mock service/account read was not verified')
   report.remote.status='service-read-verified; physical tasks remain not-run';report.physical.android='connection and owned synthetic read only; gestures not-run';save()
   await bounded(mini.reLaunch('/pages/index/index'))
   report.remote.observationWindowSeconds=180;report.status='remote-entry-only';save();console.log(JSON.stringify({status:'android-owned-mock-entry-ready',seconds:180}))
   await sleep(180000);return report
  }
  const routes=report.matrix.filter(r=>!o.cases||o.cases.includes(r.route.split('/')[1]))
  report.widths=[]
  for(const width of o.widths) {
   console.log(JSON.stringify({status:'awaiting-actual-native-width',width,timeoutSeconds:180}))
   const until=Date.now()+180000
   let actual=await bounded(mini.systemInfo())
   while(actual.windowWidth!==width&&Date.now()<until){await sleep(1500);try{actual=await bounded(mini.systemInfo())}catch(error){report.viewportTransition={reason:'Native model menu can pause app automation',lastError:error.message};save()}}
   if(actual.windowWidth!==width){report.widths.push({requested:width,actual:actual.windowWidth,status:'blocked'});continue}
   report.widths.push({requested:width,actual:actual.windowWidth,status:'measured'});save()
  for(const scale of o.scales)for(const row of routes) {
   const item={name:'native page content stays reachable',route:row.route,role:row.role,fontScale:scale,mode:o.mode,lifecycleEnabled:report.lifecycleEnabled,status:'not-run',evidence:[]}
   try {
    await bounded(mini.evaluate((scale,user)=>{getApp().nativeAcceptance.fontScale=scale;if(user){wx.setStorageSync('apiEnvironment',getApp().nativeAcceptance.api);wx.setStorageSync('token',user.token);wx.setStorageSync('userInfo',user.user);Object.assign(getApp().globalData,{userInfo:user.user,isLoggedIn:true,loginReady:true})}},scale,o.mode==='service'?session.accounts[row.role]:null))
    const name=row.route.split('/')[1],query=o.mode==='service'?(session.queries[name]||''):''
    const page=await bounded(mini.reLaunch('/'+row.route+query));await sleep(200)
    if(o.mode==='fixture')await bounded(page.setData(fixtureData(name,scale)))
    item.actualViewport=await actualViewport(mini);if(!item.actualViewport.windowHeight||item.actualViewport.windowWidth!==width)throw Error('Actual width/height changed or is unmeasurable during route capture; remaining viewport claims rejected')
    if(!item.actualViewport.windowMatches)throw Error('Live window info and native viewport disagree; height-sensitive claims blocked')
    item.geometry=await geometry(mini,page,item.actualViewport.windowWidth);Object.assign(item,assess(item.geometry))
    const file=path.join(o.out,name+'-'+row.role+'-w'+item.actualViewport.windowWidth+'-f'+scale+'.png');await bounded(mini.screenshot({path:file}));item.evidence.push(file)
    // Bottom reachability evidence is separate from screenshot quantity.
    const scroll=await bounded(page.$('scroll-view.mobile-scroll'))
    if(scroll){await bounded(scroll.scrollTo(0,999999));await sleep(100);item.scroll={height:await bounded(scroll.scrollHeight()),viewport:await bounded(scroll.size())}}
    else await bounded(mini.pageScrollTo(999999))
    if(name==='shopping-list'){
     await sleep(250)
     item.bottomMetrics=await bounded(mini.evaluate(()=>new Promise(resolve=>{const q=wx.createSelectorQuery();q.selectViewport().scrollOffset();q.select('.shopping-page').boundingClientRect();q.select('#shopping-price-details').boundingClientRect();q.select('.shopping-bottom').boundingClientRect();q.exec(v=>resolve({scroll:v[0],page:v[1],lastContentButton:v[2],footer:v[3]}))})))
     const root=await bounded(page.$('.shopping-page'));item.bottomMetrics.paddingBottom=await bounded(root.style('padding-bottom'))
     const b=item.bottomMetrics;item.bottomMetrics.lastButtonAboveFooter=!!(b.lastContentButton&&b.footer&&b.lastContentButton.bottom<=b.footer.top+1)
     if(!item.bottomMetrics.lastButtonAboveFooter){item.status='failed';item.errors.push('Last content button remains behind fixed footer at actual maximum scroll')}
     else {const button=await bounded(page.$('#shopping-price-details'));const before=!!await bounded(page.data('detailsExpanded'));await bounded(button.tap());await sleep(250);item.bottomMetrics.tap={before,after:!!await bounded(page.data('detailsExpanded'))};if(item.bottomMetrics.tap.after===before){item.status='failed';item.errors.push('Visible final price action did not open details')};await bounded(button.tap())}
    }
    const bottom=file.replace('.png','-bottom.png');await bounded(mini.screenshot({path:bottom}));item.evidence.push(bottom)
    if(o.mode==='service'&&scale===2&&name!=='custom-dishes'){
     item.interaction=await exercise(mini,page,name,o.out,item.actualViewport.windowWidth,session.assistantNativeCards)
    }
    if(o.mode==='service'&&scale===2&&name==='custom-dishes')item.interaction=o.manualConfirm&&width===320?await exercise(mini,page,name,o.out,width):{status:'not-run',reason:'Dedicated native discard confirmation not requested for this layout capture'}
    if(session?.assistantNativeCards&&scale===2&&name==='chat'&&item.interaction?.status!=='observed'){item.status='failed';item.errors.push('Native assistant card interaction did not satisfy its target/reachability assertions')}
    item.fontScaleObserved=await bounded(page.data('fontScale'))
    item.fontStyles=await fontStyles(page,scale)
    if(item.fontStyles.rootMatches===false)throw Error('Actual page font factor differs from native computed size')
    if(item.fontScaleObserved!==scale){item.status='failed';item.fontScaleMismatch={requested:scale,observed:item.fontScaleObserved};throw Error('Actual page font factor differs from requested; remaining scale claims rejected')}
    item.lifecycle=await bounded(mini.evaluate(()=>getApp().nativeAcceptance.lifecycle.slice(-12)))
    row.states[row.role==='ordinary'&&name.startsWith('admin')?'permission':'normal'].evidence.push(...item.evidence)
    row.states[row.role==='ordinary'&&name.startsWith('admin')?'permission':'normal'].status='not-run'
    row.states[row.role==='ordinary'&&name.startsWith('admin')?'permission':'normal'].reason='Native capture and geometry recorded; semantic inspection required, see cases'
    report.evidence.push(...item.evidence)
   }catch(e){item.status='blocked';item.error=String(e.message).slice(0,800)}
   report.cases.push(item);save();console.log(JSON.stringify({route:item.route,role:item.role,fontScale:scale,status:item.status,actualWidth:item.actualViewport?.windowWidth}))
   if(item.error&&/timed out|font factor|Actual width|native viewport/.test(item.error))throw Error(item.error)
  }}
  report.guard=await bounded(mini.evaluate(()=>({denied:getApp().nativeAcceptance.denied,requests:getApp().nativeAcceptance.requests,lifecycle:getApp().nativeAcceptance.lifecycle,mode:getApp().nativeAcceptance.mode})))
  report.status=report.widths.some(w=>w.status==='blocked')?'blocked-width-mismatch':report.exceptions.length||report.cases.some(c=>['failed','blocked'].includes(c.status))?'captured-with-failures':'captured-requires-inspection'
 }catch(e){report.status='blocked';report.reason=String(e.message).slice(0,800)}finally{
  // mini is assigned only after launch verifies this export's runId/mode.
  if(mini){try{await bounded(mini.close(),10000);report.ownedIdeClosed=true}catch(error){report.ownedIdeCloseError=error.message;mini.disconnect()}}
  report.endedAt=new Date().toISOString();save()
 }
 return report
}
async function exercise(mini,page,name,out,width,assistantCards=null) {
 const result={status:'not-run'}
 const call=(method,...args)=>bounded(mini.evaluate((route,method,args)=>{const p=getCurrentPages().slice(-1)[0];if(p.route!==route||typeof p[method]!=='function')throw Error('Native controller target mismatch');return p[method](...args)},page.path,method,args))
 try {
  if(name==='custom-dishes'){
   result.name='system cancel creates no copy';result.scope='Native editor discard dialog in developer tools; physical system-back remains not-run'
   if(!await bounded(page.data('copyDraft')))throw Error('Public recipe copy draft was not loaded')
   await call('onInput',{currentTarget:{dataset:{field:'name'}},detail:{value:'E18 未保存副本'}})
   await call('cancelEdit');await sleep(200)
   result.modalScreenshot=path.join(out,'copy-cancel-modal-w'+width+'.png');await bounded(mini.screenshot({path:result.modalScreenshot}))
   await bounded(mini.native().confirmModal(),10000)
   const settle=Date.now()+2500;while(await bounded(page.data('editing'))&&Date.now()<settle)await sleep(200)
   if(await bounded(page.data('editing'))){
    result.confirmation='Official SDK confirm did not close editor; manual native confirmation window (60s)'
    console.log(JSON.stringify({status:'awaiting-native-discard-click',width,timeoutSeconds:60}))
    const until=Date.now()+60000;while(await bounded(page.data('editing'))&&Date.now()<until)await sleep(500)
   }else result.confirmation='Official SDK confirm observed'
   result.editorClosed=!await bounded(page.data('editing'));result.status=result.editorClosed?'observed-requires-db-count':'failed'
   result.afterScreenshot=path.join(out,'copy-after-cancel-w'+width+'.png');await bounded(mini.screenshot({path:result.afterScreenshot}))
  }else if(name==='meal-cooking'){
   result.name='cooking heading, ingredient return and footer reachability'
   const index=await bounded(page.data('stepIndex'));await call('onNextStep');await sleep(300)
   result.stepBefore=index;result.stepAfter=await bounded(page.data('stepIndex'))
   result.heading=await bounded(mini.evaluate(()=>new Promise(r=>wx.createSelectorQuery().select('#cooking-step-heading').boundingClientRect(r).exec())))
   await call('onIngredients');await sleep(250)
   result.sheetScreenshot=path.join(out,'cooking-ingredients-w'+width+'-f2.png');await bounded(mini.screenshot({path:result.sheetScreenshot}))
   await call('closeIngredients');await sleep(250)
   result.closed=!await bounded(page.data('ingredientsVisible'));result.stepRetained=await bounded(page.data('stepIndex'))===result.stepAfter
   result.status=result.closed&&result.stepRetained&&result.heading?'observed':'failed'
  }else if(name==='chat'){
   result.name='native assistant input font and content bounds; unsent synthetic text only'
   const input=await bounded(page.$('.connected-input'))
   if(!input||await bounded(page.data('conversationInput')))throw Error('Clean connected input unavailable')
   result.placeholderStyle=await bounded(input.attribute('placeholder-style'))
   await bounded(input.input('合成未发送文字'));await sleep(150)
   result.inputObserved=await bounded(page.data('conversationInput'))
   result.inputScreenshot=path.join(out,'assistant-unsent-input-w'+width+'-f2.png');await bounded(mini.screenshot({path:result.inputScreenshot}))
   await bounded(input.input(''));result.restored=await bounded(page.data('conversationInput'))===''
   result.status=result.inputObserved==='合成未发送文字'&&result.restored?'observed':'failed'
   if(assistantCards){result.cards=await assistantCardEvidence(mini,page,call,out,width,assistantCards);if(result.cards.status!=='observed')result.status='failed'}
  }else if(name==='customize'){
   result.name='native filter removal preserves scroll'
   await call('onBrowseDurationTap',{currentTarget:{dataset:{value:60}}});await sleep(200)
   const scroll=await bounded(page.$('.recipe-browse-scroll'));if(!scroll)throw Error('Native recipe scroll unavailable')
   await bounded(scroll.scrollTo(0,300));await sleep(200)
   result.before=await bounded(mini.evaluate(()=>getCurrentPages().slice(-1)[0]._browseScrollTop||0))
   result.transportDelayMs=250
   await bounded(mini.evaluate(()=>{getApp().nativeAcceptance.readDelayMs=250}))
   try{await call('onRemoveBrowseFilter',{currentTarget:{dataset:{key:'maxCookMinutes'}}})}finally{await bounded(mini.evaluate(()=>{getApp().nativeAcceptance.readDelayMs=0}))}
   await sleep(250)
   result.after=await bounded(mini.evaluate(()=>getCurrentPages().slice(-1)[0]._browseScrollTop||0))
   result.status=result.before>50&&Math.abs(result.before-result.after)<=4?'observed':result.before<=50?'blocked':'failed'
   result.limit='Handler called through native SDK after real scroll; physical chip tap/focus remains separate'
   const categories=await bounded(page.$('.category-scroll'))
   if(categories){result.categoryScrollWidth=await bounded(categories.scrollWidth());await bounded(categories.scrollTo(99999,0));await sleep(150);const last=await bounded(page.$('#category-side'));if(last){result.lastCategory={offset:await bounded(last.offset()),size:await bounded(last.size())};const r=result.lastCategory;result.lastCategoryReachable=r.offset.left>=0&&r.offset.left+r.size.width<=width+1}}
  }
 }catch(error){result.status='blocked';result.reason=String(error.message).slice(0,600)}
 return result
}
async function assistantCardEvidence(mini,page,call,out,width,expected) {
 const result={scope:'Real owned MOCK cards; historical setup confirmed before UI, new preview NEVER confirmed',cards:[],evidence:[]}
 const scroll=await bounded(page.$('.connected-messages'))
 const viewport={...await bounded(scroll.size()),...await bounded(scroll.offset())}
 const box=async element=>({...await bounded(element.size()),...await bounded(element.offset())})
 const capture=async label=>{const file=path.join(out,'assistant-'+label+'-w'+width+'-f2.png');await bounded(mini.screenshot({path:file}));result.evidence.push(file)}
 const inspect=async()=>{
  const rows=[]
  for(const host of await bounded(page.$$('assistant-card'))){const card=await bounded(host.data('card')),view=await bounded(host.data('view'));if(!card||!view)continue;rows.push({host,card,view})}
  return rows
 }
 const reach=async element=>{
  const before=await box(element),top=Number(await bounded(scroll.property('scrollTop')))||0
  await bounded(scroll.scrollTo(0,Math.max(0,top+before.top-viewport.top-8)));await sleep(200)
  return box(element)
 }
 let cards=await inspect()
 const historical=cards.find(c=>!!c.card.receiptRef),preview=cards.find(c=>c.view.canConfirm&&c.card.type==='calendar_save')
 if(!historical||!preview)throw Error('Native history receipt or unconfirmed preview card absent')
 for(const [kind,item] of [['historical',historical],['preview',preview]]){
  const root=await bounded(item.host.$('.assistant-card')),title=await bounded(item.host.$('.card-title'))
  const rect=await reach(title);await capture(kind+'-top')
  result.cards.push({kind,type:item.card.type,target:item.view.targetLabel,receiptPresent:!!item.card.receiptRef,canConfirm:item.view.canConfirm,active:await bounded(item.host.data('active')),titleBox:rect,rootBox:await box(root),fontSize:await bounded(root.style('font-size'))})
 }
 let confirm
 for(const action of await bounded(preview.host.$$('ui-button')))if(await bounded(action.data('label'))==='确认保存计划'){confirm=await bounded(action.$('.button'));break}
 if(!confirm)throw Error('Unconfirmed preview confirmation control absent')
 result.confirmBox=await reach(confirm);result.confirmFontSize=await bounded(confirm.style('font-size'))
 result.confirmReachable=result.confirmBox.left>=0&&result.confirmBox.left+result.confirmBox.width<=width+1&&result.confirmBox.top>=viewport.top-1&&result.confirmBox.top+result.confirmBox.height<=viewport.top+viewport.height+1&&result.confirmBox.height>=47.5
 await capture('preview-confirm-reachable')
 await call('onConversationCurrentMenu');await sleep(300)
 cards=await inspect();const current=cards.find(c=>c.card.id==='current-menu')
 if(!current)throw Error('Current meal anchor failed to render actual workspace card')
 const currentTitle=await bounded(current.host.$('.card-title'));await reach(currentTitle);await capture('current-menu-anchor')
 result.current={target:current.view.targetLabel,current:!!current.view.menuActions?.current,actionsEnabled:!!current.view.menuActions?.enabled,scrollTarget:await bounded(page.data('conversationScrollTarget'))}
 const label=(target)=>target.date+' '+({lunch:'午餐',dinner:'晚餐',breakfast:'早餐'}[target.mealType])
 result.targetsDistinguished=result.cards[0].target===label(expected.historicalTarget)&&result.cards[1].target===label(expected.previewTarget)&&result.current.target===label(expected.currentTarget)
 const expectedFont=Number(await bounded(page.data('fontBase')))*Number(await bounded(page.data('fontScale')))
 result.fontMatches=result.cards.every(c=>Math.abs(parseFloat(c.fontSize)-expectedFont)<.5)&&Math.abs(parseFloat(result.confirmFontSize)-expectedFont)<.5
 result.previewNeverConfirmed=true;result.viewport=viewport
 result.status=result.targetsDistinguished&&result.confirmReachable&&result.fontMatches&&result.current.current&&!result.current.actionsEnabled&&result.current.scrollTarget==='conversation-current-menu'?'observed':'failed'
 return result
}
function fixtureData(name,fontScale) {
 // Only the data below are fixture claims. Missing route/state examples remain not-run.
 const common={fontScale,loading:false,error:false,errorMessage:'',loadingMore:false,busy:false}
 if(name==='recommend-filter')return {...common,featureEnabled:true,tagMode:'include',criteria:{cuisineCodes:[],includeTagCodes:[],excludeTagCodes:[],excludedIngredients:['花生','香菜'],maxCookMinutes:null},durationOptions:[{label:'不限',value:null},{label:'30分钟',value:30}],groupViews:[{key:'flavor',label:'口味',items:[{code:'LIGHT',label:'清淡',selected:true}]}]}
 if(name==='meal-cooking')return {...common,recipeMode:true,dishName:'夹具 · 番茄炒蛋',dishes:[{id:1,name:'夹具 · 番茄炒蛋'}],steps:['番茄洗净后切块，将鸡蛋打散。热锅后翻炒鸡蛋，加入番茄炒熟。'.repeat(5)],stepIndex:0,ingredients:['番茄 300克','鸡蛋 2个'],cookingActionHeight:176}
 return common
}
async function main(argv=process.argv.slice(2)) {
 const o=options(argv);outside(o.out)
 if(!o.python)throw Error('Installed Python required through --python or CODEX_PYTHON')
 if(o.mode==='service'&&!o.session){const args=[path.join(__dirname,'experience_continuity_native.py'),'--config',path.resolve(o.config),'--out',o.out,'--node',o.node,'--driver',__filename,'--width',String(o.width),'--widths',o.widths.join(','),'--scales',o.scales.join(','),'--port',String(o.port),'--python',o.python];for(const k of ['sdk','cli'])if(o[k])args.push('--'+k,o[k]);if(o.cases)args.push('--cases',o.cases.join(','));if(o.prepare)args.push('--prepare-only');if(o.remote)args.push('--remote');if(o.manualConfirm)args.push('--manual-confirm');if(o.assistantCards)args.push('--assistant-cards');return await new Promise(resolve=>{const child=cp.spawn(o.python,args,{windowsHide:true,stdio:'inherit'});child.on('exit',code=>{process.exitCode=code||0;resolve()});child.on('error',e=>{console.error(e.message);process.exitCode=1;resolve()})})}
 const session=o.session?read(o.session):null
 if(o.mode==='service'&&(!session||session.purpose!=='E18-new-owned-native'||session.ownerPid!==process.ppid||!session.nonce||session.nonce!==process.env.EATWHAT_E18_CHILD||session.sourceSha!==cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()))throw Error('Fresh owned coordinator session required')
 const manifest=prepare(o,session)
 if(o.prepare){console.log(JSON.stringify({status:'prepared-not-tested',project:manifest.project,appFingerprint:manifest.appFingerprint}));return}
 const result=await capture(o,manifest,session);if(['blocked','blocked-width-mismatch','captured-with-failures'].includes(result.status))process.exitCode=2
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1})
module.exports={options,matrix,guardSource,assess,validate,prepare,fingerprint,outside}
