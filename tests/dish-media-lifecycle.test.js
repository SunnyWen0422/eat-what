const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module'),path=require('node:path')
const {imageSource}=require('../utils/dish-image')
function component(file,props){
 let def;vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:v=>def=v,require:createRequire(path.resolve(file)),wx:{getStorageSync:()=>null}})
 const view={...def.methods,properties:props,data:structuredClone(def.data),setData(p){for(const [key,value] of Object.entries(p)){if(key.startsWith('failedImages.'))this.data.failedImages[key.slice(13)]=value;else this.data[key]=value}}}
 return view
}
test('card failure resets on a new content revision even if image URL is unchanged',()=>{
 const row=component('components/compact-dish-row/index.js',{dish:{id:1,name:'菜',contentVersion:'v1',image:'https://img.example/a'},reducedMotion:true})
 row.updateDish();row.onImageError();assert.equal(row.data.imageFailed,true)
 row.properties.dish={...row.properties.dish,contentVersion:'v2'};row.updateDish()
 assert.equal(row.data.imageFailed,false)
})
test('unsafe schemes and URL credentials are not sent to the image element',()=>{
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg/>','https://name:secret@img.example/a','https://img.example/a\nb'])
  assert.equal(imageSource(value),'')
 assert.equal(imageSource('/images/local.png'),'/images/local.png')
})
test('assistant recommendation photos reset failure with a new recipe version',()=>{
 const card={type:'recipe',data:{id:1,name:'菜',contentVersion:'v1',image:'https://img.example/a'}}
 const row=component('components/assistant-card/index.js',{card});row.refresh()
 row.onImageError({currentTarget:{dataset:{key:'1',source:'https://img.example/a'}}})
 assert.ok(row.data.failedImages['1'])
 row.properties.card={...card,data:{...card.data,contentVersion:'v2'}};row.refresh()
 assert.equal(row.data.failedImages['1'],undefined)
})
