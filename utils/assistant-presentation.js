const suggestions=[
 {id:'arrange',label:'安排这餐',text:'按当前人数和要求安排这餐'},
 {id:'replace',label:'换道菜',text:'帮我换一道菜'},
 {id:'shopping',label:'准备食材',text:'准备这餐的采购清单'},
 {id:'arrangements',label:'看看安排',text:'看看我已有的用餐安排'},
]
function buildAssistantSuggestions({hasMenu,available}) {
 return available?suggestions.filter(s=>hasMenu || ['arrange','arrangements'].includes(s.id)).map(s=>({...s})):[]
}
module.exports={buildAssistantSuggestions}
