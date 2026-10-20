const test=require('node:test'),assert=require('node:assert/strict')
const assistantPage=require('../utils/assistant-page')
function fixture(){
 const page=assistantPage({data:{},current:()=>true})
 let measured=0
 page.setData=(patch,done)=>{Object.assign(page.data,patch);if(done)done()}
 page.measureConversation=()=>measured++
 Object.assign(page.data,{conversationInput:'未发送的要求',conversationScrollTarget:'conversation-end'})
 return {page,measured:()=>measured}
}
test('expanding or collapsing pinned settings remeasures chat without moving its scroll target or input',()=>{
 const {page,measured}=fixture()
 page.onToggleConversationMenu();assert.equal(page.data.conversationMenuExpanded,true)
 page.onToggleConversationMenu();assert.equal(page.data.conversationMenuExpanded,false)
 assert.equal(measured(),2);assert.equal(page.data.conversationInput,'未发送的要求')
 assert.equal(page.data.conversationScrollTarget,'conversation-end')
 page.data.conversationMealSettingsVisible=true
 page.onToggleConversationMenu();assert.equal(measured(),2)
})
test('editor keyboard keeps its focused field reachable without scrolling the conversation',()=>{
 const {page,measured}=fixture();page.data.conversationMealSettingsVisible=true
 page.onConversationSettingsFocus({currentTarget:{id:'conversation-settings-requirements'}})
 page.onConversationKeyboard({detail:{height:280}})
 assert.equal(page.data.keyboardHeight,280)
 assert.equal(page.data.conversationSettingsScrollTarget,'conversation-settings-requirements')
 assert.equal(page.data.conversationScrollTarget,'conversation-end')
 assert.equal(page.data.conversationInput,'未发送的要求')
 page.onConversationKeyboard({detail:{height:0}});assert.equal(page.data.keyboardHeight,0)
 page.data.conversationMealSettingsVisible=false;page.data.conversationSettingsScrollTarget=''
 page.onConversationKeyboard({detail:{height:280}})
 assert.equal(page.data.conversationSettingsScrollTarget,'');assert.equal(measured(),3)
})
test('view current menu still targets the menu in chat after settings become pinned',()=>{
 const {page,measured}=fixture();let refresh=0
 page.refreshConversationMenus=()=>refresh++
 page.data.conversationCurrentMenu={id:'current-menu'}
 page.onConversationCurrentMenu()
 assert.equal(page.data.conversationMenuExpanded,false)
 assert.equal(page.data.conversationCurrentMenuVisible,true)
 assert.equal(page.data.conversationScrollTarget,'conversation-current-menu')
 assert.equal(page.data.conversationSettingsScrollTarget,'')
 assert.equal(measured(),1);assert.equal(refresh,1)
})
