const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function component(name,properties={}){
 let def;const file=path.resolve('components',name,name+'.js'),events=[]
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:d=>def=d,require:n=>n.includes('experience-preferences')?()=>({get:()=>({reducedMotion:false})}):require(path.resolve(path.dirname(file),n)),wx:{}})
 const defaults=Object.fromEntries(Object.entries(def.properties||{}).map(([k,v])=>[k,v&&v.value])),view={...def.methods,properties:{...defaults,...properties},data:{...def.data,...defaults,...properties},setData:v=>Object.assign(view.data,v),triggerEvent:(type,detail)=>events.push({type,detail})}
 def.lifetimes?.attached?.call(view);return{def,view,events}
}
test('field has one complete accessible name and disabled input never changes data',()=>{
 const {view,events}=component('ui-field',{label:'人数',required:true,error:'请输入1至50人',disabled:true,errorId:'people-error'})
 view.updateAccessibility();assert.match(view.data.ariaLabel,/人数/);assert.match(view.data.ariaLabel,/必填/);assert.equal(view.data.ariaLabel.split('请输入1至50人').length-1,1)
 view.input({detail:{value:'4'}});assert.equal(events.length,0);view.properties.disabled=false;view.input({detail:{value:'4'}});assert.equal(events[0].detail.value,'4')
 const source=fs.readFileSync('components/ui-field/ui-field.wxml','utf8');assert.match(source,/<input[^>]*aria-label="{{ariaLabel}}"/);assert.match(source,/id="{{resolvedErrorId}}"/);assert.match(source,/class="error"[^>]*aria-hidden="true"/)
})
test('confirmation reuses the keyboard-aware sheet and forwards input focus restoration',()=>{
 const {view,events}=component('ui-confirm',{busy:false,returnFocusId:'meal-input'});view.restoreFocus({detail:{id:'meal-input'}});assert.deepEqual(JSON.parse(JSON.stringify(events[0])),{type:'restorefocus',detail:{id:'meal-input'}})
 const source=fs.readFileSync('components/ui-confirm/ui-confirm.wxml','utf8');assert.match(source,/<ui-sheet/);assert.match(source,/return-focus-id="{{returnFocusId}}"/);assert.match(source,/slot="footer"/)
 view.properties.busy=true;view.data.busy=true;view.confirm();view.cancel();assert.equal(events.length,1)
})
test('visible labels and icons do not duplicate an icon button name',()=>{
 const source=fs.readFileSync('components/ui-icon-button/ui-icon-button.wxml','utf8');assert.match(source,/<button[^>]*aria-label="{{label}}"/);assert.doesNotMatch(source,/<ui-icon[^>]*label="{{label}}"/)
})
test('shared controls keep readable wrapping and physical event-node dimensions',()=>{
 const field=fs.readFileSync('components/ui-field/ui-field.wxss','utf8');assert.match(field,/height:calc\(1\.5em \+ 24px\)/)
 const confirm=fs.readFileSync('components/ui-confirm/ui-confirm.wxss','utf8');assert.match(confirm,/flex-wrap:wrap/);assert.match(confirm,/min-height:48px/);assert.doesNotMatch(confirm,/(?:^|[;{])\s*height:\s*(?:44|48)px;/)
})
