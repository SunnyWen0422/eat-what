const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..')
test('every local component registration resolves to a complete native component',()=>{
 const files=['app.json'];
 for(const dir of ['pages','components'])for(const name of fs.readdirSync(path.join(root,dir),{recursive:true}))if(name.endsWith('.json'))files.push(path.join(dir,name))
 for(const file of files){
  const config=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))
  for(const [name,target] of Object.entries(config.usingComponents||{})){
   if(target.startsWith('plugin://'))continue
   const base=target.startsWith('/')?path.join(root,target.slice(1)):path.resolve(root,path.dirname(file),target)
   for(const ext of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(base+ext),`${file}: ${name} -> ${target}${ext} is missing`)
   assert.equal(JSON.parse(fs.readFileSync(base+'.json','utf8')).component,true,`${file}: ${name} must register a component`)
  }
 }
})
