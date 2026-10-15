const test=require('node:test'),assert=require('node:assert/strict')
const {createAssistantConversation,probeAssistantCapability,clearCapabilityCache}=require('../utils/assistant-conversation')
for(const extended of [false,true])test('optional UI features are sent only after negotiation '+extended,async()=>{
 clearCapabilityCache();const sent=[],memory=new Map()
 const api={getAssistantV4Capabilities:async()=>({enabled:true,schemaVersion:'assistant.v4.1',reads:['read_current_meal'],draftCommands:[],previewActions:[],...(extended?{supportedUiFeatures:['clarification_v1','handoff_v1','unsafe_write']}:{} )}),
 createAssistantV4Session:async()=>({sessionId:'s',messages:[]}),sendAssistantV4Turn:async(_id,body)=>{sent.push(body);return{turnId:'t'}},
 getAssistantV4Turn:async()=>({turnId:'t',status:'completed',reply:'已读到',cards:[]})}
 const options={api,source:'test-api',identity:'test-user',read:k=>memory.get(k),write:(k,v)=>memory.set(k,v),workspaceStore:{state:()=>({workspace:{id:'w',revision:1,draft:{planVersion:1,dishes:[]}},dirty:false,pending:null})}}
 assert.equal(await probeAssistantCapability(options),true)
 const conversation=createAssistantConversation(options);await conversation.load();await conversation.send('看看这餐')
 assert.equal(sent.length,1)
 if(extended)assert.deepEqual(sent[0].uiFeatures,['clarification_v1','handoff_v1']);else assert.equal(Object.hasOwn(sent[0],'uiFeatures'),false)
 conversation.dispose()
})
