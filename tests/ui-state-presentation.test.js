const test=require('node:test'),assert=require('node:assert/strict')
test('ordinary loading has no illustration or implied assistant role',()=>{
 const {deriveStateAppearance}=require('../utils/ui-state-presentation')
 const view=deriveStateAppearance({kind:'loading',illustration:'agent-thinking',density:'page'})
 assert.equal(view.showIllustration,false);assert.equal(view.inline,true);assert.equal(view.icon,'')
})
test('first empty state may use its illustration but filtered or error states stay compact',()=>{
 const {deriveStateAppearance}=require('../utils/ui-state-presentation')
 assert.equal(deriveStateAppearance({kind:'empty',illustration:'empty-favorites',density:'page'}).showIllustration,true)
 assert.equal(deriveStateAppearance({kind:'empty',illustration:'empty-favorites',density:'inline'}).showIllustration,false)
 assert.equal(deriveStateAppearance({kind:'error',illustration:'empty-favorites'}).showIllustration,false)
 assert.equal(deriveStateAppearance({kind:'error'}).icon,'warning')
})
