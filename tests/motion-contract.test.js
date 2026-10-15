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
