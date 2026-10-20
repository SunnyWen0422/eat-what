// Display only. Keep source recipes and step/image positions unchanged.
function stripStepNumber(value) {
 const text=typeof value==='string'?value.trim():''
 // A decimal, time, temperature, fraction or ingredient quantity is not a list
 // marker. Only remove an explicit leading ordinal with a nonempty body.
 const marker=/^(?:(?:第\s*[0-9一二三四五六七八九十百]+\s*步|步骤\s*[0-9一二三四五六七八九十百]+|step\s*\d+)\s*[.．、:：)）-]?\s*|[（(]\s*\d+\s*[)）]\s*|\d+\s*(?:[.．](?!\d)|[、)）])\s*|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*)/i
 const body=text.replace(marker,'').trim()
 return body||text
}
function presentRecipeSteps(value) {
 return require('./recipe-quality').presentRecipeLines(value).map(stripStepNumber)
}
function presentHowto(howto) {
 return howto?{...howto,steps:presentRecipeSteps(howto.steps)}:null
}
module.exports={stripStepNumber,presentRecipeSteps,presentHowto}
