const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
test('microinteraction templates use the established motion tokens',()=>{
 const tokens=require('../design/tokens.json');assert.deepEqual(tokens.motion,{press:100,row:180,sheet:200})
 for(const [file,key] of [['design/wxss/components/ui-button/ui-button.tpl','press'],['design/wxss/components/ui-sheet/ui-sheet.tpl','sheet'],['design/wxss/components/action-feedback/index.tpl','row']])assert.match(fs.readFileSync(file,'utf8'),new RegExp('{{motion\\.'+key+'\\.ms}}'))
})
test('shared button press transition becomes zero when motion is reduced',()=>{
 let def,reduced=false;const file=path.resolve('components/ui-button/ui-button.js')
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:d=>def=d,require:n=>n.includes('experience-preferences')?()=>({get:()=>({reducedMotion:reduced})}):require(path.resolve(path.dirname(file),n))})
 const view={...def.methods,properties:{},data:{},setData:v=>Object.assign(view.data,v)}
 view.updateMotion();assert.equal(view.data.pressDuration,100);reduced=true;view.updateMotion();assert.equal(view.data.pressDuration,0);reduced=false;view.properties.reducedMotion=true;view.updateMotion();assert.equal(view.data.pressDuration,0)
})
test('legacy progress no longer blinks and reduced state indicators remain static',()=>{
 const chat=fs.readFileSync('pages/chat/chat.wxss','utf8');assert.match(chat,/\.task-dot-loading,\.dot \{ animation:none; \}/)
 const state=fs.readFileSync('components/ui-state/ui-state.wxss','utf8');assert.match(state,/\.spinner\.is-static \{ animation:none; \}/)
})

function fixture(name, properties) {
 let def;const file=path.resolve('components',name,'index.js'),events=[]
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:d=>def=d,require:n=>n.includes('experience-preferences')?()=>({get:()=>({reducedMotion:false})}):require(path.resolve(path.dirname(file),n))})
 const view={...def.methods,properties,data:structuredClone(def.data),setData:value=>Object.assign(view.data,value),triggerEvent:(type,detail)=>events.push({type,detail})}
 def.lifetimes?.attached?.call(view);return {view,events}
}

test('changed dish keeps surrounding geometry: component updates stay local to their own dish',()=>{
 const dishes=[{id:1,name:'番茄炒蛋',type:'veg'},{id:2,name:'清蒸鲈鱼',type:'meat'},{id:3,name:'冬瓜汤',type:'soup'}]
 const rows=dishes.map(dish=>fixture('compact-dish-row',{dish,mode:'replace',busy:false}))
 const before=rows.map(row=>structuredClone(row.view.data));rows[1].view.properties.busy=true;rows[1].view.onReplace()
 assert.equal(rows[1].events.length,0)
 rows[1].view.properties.dish={id:4,name:'香菇炖鸡',type:'meat'};rows[1].view.properties.busy=false;rows[1].view.updateDish();rows[1].view.onReplace()
 assert.deepEqual(rows.map(row=>row.view.data.dishView.id),[1,4,3])
 assert.deepEqual(structuredClone(rows[0].view.data),before[0]);assert.deepEqual(structuredClone(rows[2].view.data),before[2])
 assert.equal(rows[1].events[0].type,'replace');assert.equal(rows[1].events[0].detail.id,4)
})

test('reduced motion preserves outcomes: receipts, undo and destination stay available',()=>{
 const feedback={state:'success',message:'已保存这餐',requestId:'local-receipt',undoAvailable:true,target:{date:'2026-10-16',mealType:'dinner'}}
 const outcomes=[false,true].map(reducedMotion=>{
  const {view,events}=fixture('action-feedback',{feedback,busy:false,reducedMotion});assert.equal(view.data.motionDuration,reducedMotion?0:180)
  view.onUndo();view.onView();assert.equal(view.properties.feedback.message,feedback.message)
  return JSON.parse(JSON.stringify(events))
 })
 assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[1].map(event=>event.type),['undo','view'])
 const {view}=fixture('compact-dish-row',{dish:{id:1,name:'冬瓜汤'},reducedMotion:true})
 assert.equal(view.data.motionDuration,0);assert.equal(view.data.pressDuration,0)
})
