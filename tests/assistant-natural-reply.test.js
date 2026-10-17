const test=require('node:test'),assert=require('node:assert/strict')
const {presentCard}=require('../utils/assistant-cards')
test('natural explanation can accompany photo card and does not create write confirmation',()=>{
 const card=presentCard({id:'read',type:'recipe',data:{kind:'readonly_fact',dishes:[{id:1,name:'番茄炒蛋',image:'/images/synthetic.jpg',cookMinutes:15}]}})
 assert.equal(card.rows[0].name,'番茄炒蛋');assert.equal(card.rows[0].image,'/images/synthetic.jpg');assert.match(card.rows[0].url,/id=1/);assert.equal(card.canConfirm,false)
})
test('no image and real pending save remain independent of explanation',()=>{
 const recipe=presentCard({id:'read',type:'recipe',data:{dishes:[{id:2,name:'青菜'}]}});assert.equal(recipe.rows[0].image,'')
 const save=presentCard({id:'save',type:'calendar_save',taskId:'task',previewToken:'token',expiresAt:Date.now()+60000,data:{date:'2026-10-18',mealType:'dinner'}});assert.equal(save.canConfirm,true)
})
