const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function card(){let definition;vm.runInNewContext(fs.readFileSync('components/dish-card/dish-card.js','utf8'),{Component:d=>definition=d});const events=[];const page={data:{dish:{id:7,name:'青菜'},mode:'select',selected:false,disabled:false},properties:{mode:'select',disabled:false},triggerEvent:(name,detail)=>events.push({name,id:detail.dish.id})};return{definition,page,events}}
test('dish selection emits only the select action while opening emits only detail',()=>{
 const f=card();f.definition.methods.choose.call(f.page);assert.deepEqual(f.events,[{name:'select',id:7}]);f.events.length=0;f.definition.methods.open.call(f.page);assert.deepEqual(f.events,[{name:'open',id:7}])
})
test('browse mode and disabled selection never change the selected dishes',()=>{
 const f=card();f.page.data.mode='browse';f.definition.methods.choose.call(f.page);f.page.data.mode='select';f.page.data.disabled=true;f.definition.methods.choose.call(f.page);assert.deepEqual(f.events,[])
})
